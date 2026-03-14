import asyncio
import json
import logging
import os
import secrets
import uuid
from typing import Any

import httpx
from fastapi import APIRouter, FastAPI, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from supabase import Client, create_client

logger = logging.getLogger(__name__)


def init_supabase_client() -> Client:
    supabase_url = os.getenv("SUPABASE_URL")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not service_role_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables."
        )

    return create_client(supabase_url, service_role_key)


supabase: Client = init_supabase_client()

app = FastAPI(title="LunasAI Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)
router = APIRouter(prefix="/v1")


class CreateProductRequest(BaseModel):
    prompt_text: str = Field(min_length=1, max_length=500)


class CheckoutStartRequest(BaseModel):
    tier_id: str
    product_id: str | None = None
    customer_name: str | None = Field(default=None, max_length=255)
    customer_email: str | None = Field(default=None, max_length=320)
    customer_mobile: str | None = Field(default=None, max_length=32)


def _extract_first_row(result: Any) -> dict[str, Any] | None:
    rows = getattr(result, "data", None)
    if isinstance(rows, list) and rows:
        return rows[0]
    return None


def _sse(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def _call_mayar(endpoint: str, payload: dict[str, Any]) -> dict[str, Any]:
    mayar_api_key = os.getenv("MAYAR_API_KEY")
    if not mayar_api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="MAYAR_API_KEY is not set.",
        )

    url = endpoint if endpoint.startswith("http") else f"https://api.mayar.id{endpoint}"

    if "/hl/v1/payment/create" in url:
        payload.setdefault("customerEmail", "pembeli@lunasai.com")
        payload.setdefault("customerMobile", "081234567890")

    # Validate amount for Mayar contracts (IDR minimum commonly enforced).
    if "amount" in payload:
        try:
            parsed_amount = int(payload["amount"])
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid Mayar amount. It must be an integer.",
            ) from exc
        if parsed_amount < 1000:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid Mayar amount. Minimum is 1000.",
            )
        payload["amount"] = parsed_amount

    safe_payload = dict(payload)
    safe_payload.pop("customerEmail", None)
    safe_payload.pop("customerName", None)
    safe_payload.pop("customerMobile", None)
    print(f"Mayar request url={url} payload={safe_payload}")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {mayar_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            response_payload = response.json()
    except httpx.HTTPStatusError as exc:
        response_status = exc.response.status_code if exc.response is not None else "unknown"
        response_text = exc.response.text if exc.response is not None else "<no body>"
        print(f"Mayar API error status={response_status} body={response_text}")
        logger.error(
            "Mayar API error. url=%s status=%s body=%s",
            url,
            response_status,
            response_text,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Mayar API request failed with status {response_status}.",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to connect to Mayar API.",
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Mayar API returned an invalid JSON response.",
        ) from exc

    if not isinstance(response_payload, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Mayar API returned an invalid response shape.",
        )

    return response_payload


def _extract_mayar_data(payload: dict[str, Any]) -> dict[str, Any]:
    data = payload.get("data")
    if isinstance(data, dict):
        return data
    return payload


def _extract_mayar_checkout_fields(payload: dict[str, Any]) -> tuple[str, str, str]:
    data = _extract_mayar_data(payload)
    payment_link_id = (
        data.get("paymentLinkId")
        or data.get("payment_link_id")
        or data.get("paymentRequestId")
        or data.get("payment_request_id")
        or data.get("id")
    )
    transaction_id = (
        data.get("transactionId")
        or data.get("transaction_id")
        or data.get("txId")
        or data.get("tx_id")
        or data.get("id")
    )
    checkout_url = (
        data.get("link")
        or data.get("url")
        or data.get("checkout_url")
        or data.get("checkoutUrl")
    )
    if not isinstance(payment_link_id, str) or not payment_link_id.strip():
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Mayar API response missing payment link identifier.",
        )
    if not isinstance(transaction_id, str) or not transaction_id.strip():
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Mayar API response missing transaction identifier.",
        )
    if not isinstance(checkout_url, str) or not checkout_url.strip():
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Mayar API response missing checkout link.",
        )
    return payment_link_id.strip(), transaction_id.strip(), checkout_url.strip()


def _extract_gemini_text(payload: dict[str, Any]) -> str:
    candidates = payload.get("candidates", [])

    if not candidates:
        raise ValueError("Gemini returned no candidates.")

    parts = candidates[0].get("content", {}).get("parts", [])

    if not parts:
        raise ValueError("Gemini returned empty parts.")

    result = parts[0].get("text", "").strip()

    if not result:
        raise ValueError("Gemini returned empty text.")

    return result


def _parse_llm_json(raw_text: str) -> dict[str, Any]:
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = "\n".join(
            line for line in cleaned.splitlines() if not line.strip().startswith("```")
        ).strip()

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        parsed = json.loads(cleaned[start : end + 1])

    if not isinstance(parsed, dict):
        raise ValueError("LLM output JSON must be an object.")
    return parsed


def _normalize_generated_tiers(raw_tiers: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_tiers, list):
        raise ValueError("Generated tiers must be a list.")

    normalized: list[dict[str, Any]] = []
    for item in raw_tiers:
        if not isinstance(item, dict):
            raise ValueError("Each tier must be an object.")

        name = item.get("name")
        description = item.get("description")
        price = item.get("price")

        if not isinstance(name, str) or not name.strip():
            raise ValueError("Tier name is required.")
        if not isinstance(description, str) or not description.strip():
            raise ValueError("Tier description is required.")
        if isinstance(price, bool):
            raise ValueError("Tier price must be an integer.")

        try:
            price_int = int(price)
        except (TypeError, ValueError) as exc:
            raise ValueError("Tier price must be an integer.") from exc

        normalized.append(
            {
                "name": name.strip(),
                "description": description.strip(),
                "price": price_int,
            }
        )

    return normalized


def _mark_generation_failed(
    job_id: str, product_id: str | None, error_code: str, error_message: str
) -> None:
    supabase.table("jobs").update({"status": "failed", "error_code": error_code}).eq(
        "job_id", job_id
    ).execute()
    if product_id:
        supabase.table("products").update(
            {
                "status": "error",
                "generation_error_code": error_code,
                "generation_error_message": error_message,
            }
        ).eq("product_id", product_id).execute()


@router.post("/products")
async def create_product(payload: CreateProductRequest) -> dict:
    product_id = str(uuid.uuid4())

    supabase.table("products").insert(
        {
            "product_id": product_id,
            "creator_id": "00000000-0000-0000-0000-000000000000",
            "prompt_text": payload.prompt_text,
            "status": "draft",
        }
    ).execute()

    return {"product_id": product_id}


@router.post("/products/{product_id}/generate")
async def generate_product(product_id: uuid.UUID) -> dict:
    product_id_str = str(product_id)
    print("DEBUG: Generation Started")

    product_result = (
        supabase.table("products")
        .select("product_id")
        .eq("product_id", product_id_str)
        .limit(1)
        .execute()
    )
    if not _extract_first_row(product_result):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Product not found."
        )

    job_id = str(uuid.uuid4())
    supabase.table("jobs").insert(
        {
            "job_id": job_id,
            "product_id": product_id_str,
            "status": "queued",
        }
    ).execute()

    return {"job_id": job_id}


@router.post("/products/{product_id}/publish")
async def publish_product(product_id: uuid.UUID) -> dict:
    product_id_str = str(product_id)
    product_result = (
        supabase.table("products")
        .select("status")
        .eq("product_id", product_id_str)
        .limit(1)
        .execute()
    )
    product_row = _extract_first_row(product_result)
    if not product_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Product not found."
        )

    if product_row.get("status") != "links_ready":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Product is not ready to publish.",
        )

    slug = str(uuid.uuid4())[:8]
    supabase.table("products").update(
        {"status": "published", "storefront_slug": slug}
    ).eq("product_id", product_id_str).execute()

    return {"storefront_url": f"/s/{slug}"}


@router.get("/storefront/{slug}")
async def storefront_by_slug(slug: str) -> dict:
    product_result = (
        supabase.table("products")
        .select("product_id,storefront_payload")
        .eq("storefront_slug", slug)
        .eq("status", "published")
        .limit(1)
        .execute()
    )
    product_row = _extract_first_row(product_result)
    if not product_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Storefront not found."
        )

    product_id = product_row["product_id"]
    payload = product_row.get("storefront_payload")
    if not isinstance(payload, dict):
        payload = {}

    tiers_result = (
        supabase.table("tiers")
        .select("tier_id,name,price,description")
        .eq("product_id", product_id)
        .execute()
    )
    tiers = getattr(tiers_result, "data", None)
    if not isinstance(tiers, list):
        tiers = []

    return {
        "slug": slug,
        "product_id": product_id,
        "headline": payload.get("headline", f"Storefront Preview for {slug}"),
        "benefits": payload.get("benefits", []),
        "tiers": tiers,
        "faqs": payload.get("faqs", []),
    }


@router.get("/jobs/{job_id}/stream")
async def stream_job(job_id: uuid.UUID) -> StreamingResponse:
    async def event_generator() -> Any:
        job_id_str = str(job_id)
        product_id: str | None = None

        try:
            # SSE prelude so the connection starts cleanly before heavy work.
            yield ":ok\n\n"
            await asyncio.sleep(0)

            job_lock_result = (
                supabase.table("jobs")
                .update({"status": "running"})
                .eq("job_id", job_id_str)
                .eq("status", "queued")
                .execute()
            )
            job_lock_rows = getattr(job_lock_result, "data", None)
            if not isinstance(job_lock_rows, list) or not job_lock_rows:
                yield _sse(
                    {
                        "event": "error",
                        "data": "Job already started or finished",
                        "message": "Job already started or finished",
                    }
                )
                return

            yield _sse({"event": "job_started"})
            await asyncio.sleep(0)

            job_result = (
                supabase.table("jobs")
                .select("product_id")
                .eq("job_id", job_id_str)
                .limit(1)
                .execute()
            )
            job_row = _extract_first_row(job_result)
            if not job_row:
                yield _sse({"event": "error", "message": "Job not found"})
                return

            product_id = job_row["product_id"]
            product_result = (
                supabase.table("products")
                .select("prompt_text")
                .eq("product_id", product_id)
                .limit(1)
                .execute()
            )
            product_row = _extract_first_row(product_result)
            if not product_row:
                _mark_generation_failed(
                    job_id=job_id_str,
                    product_id=product_id,
                    error_code="PRODUCT_NOT_FOUND",
                    error_message="Product not found.",
                )
                yield _sse({"event": "error", "message": "Product not found"})
                return

            prompt_text = product_row.get("prompt_text")
            if not isinstance(prompt_text, str) or not prompt_text.strip():
                _mark_generation_failed(
                    job_id=job_id_str,
                    product_id=product_id,
                    error_code="INVALID_PROMPT",
                    error_message="Prompt is empty or invalid.",
                )
                yield _sse({"event": "error", "message": "Invalid prompt"})
                return

            gemini_api_key = os.getenv("GEMINI_API_KEY")
            if not gemini_api_key:
                _mark_generation_failed(
                    job_id=job_id_str,
                    product_id=product_id,
                    error_code="MISSING_GEMINI_API_KEY",
                    error_message="GEMINI_API_KEY is not set.",
                )
                yield _sse({"event": "error", "message": "Generation failed"})
                return

            async with httpx.AsyncClient(timeout=120.0) as client:
                # Using the stable gemini-2.5-flash model
                gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_api_key}"
                gemini_response = await client.post(
                    gemini_url,
                    headers={"Content-Type": "application/json"},
                    json={
                        "systemInstruction": {
                            "parts": [
                                {
                                    "text": (
                                        "You are LunasAI. Output strictly JSON. Schema: "
                                        "{headline: str, benefits: [str], tiers: [{name: str, price: int, description: str}], "
                                        "faqs: [{question: str, answer: str}]}. Prices must be integers. Use Indonesian language. "
                                        "For the benefits section, provide a punchy 4-6 word title AND a supporting 12-15 word "
                                        "description for each point to ensure a professional UI density. Format each benefit as "
                                        "'Title - Description'. "
                                        "Each tier description MUST be exactly one short, punchy sentence of maximum 80 characters. "
                                        "Never exceed this limit. "
                                        "If prompt is unsafe, you MUST refuse by setting headline to exactly 'REFUSED'."
                                    )
                                }
                            ]
                        },
                        "contents": [{"role": "user", "parts": [{"text": prompt_text}]}],
                        "generationConfig": {"responseMimeType": "application/json"},
                    },
                )
                gemini_response.raise_for_status()
                gemini_payload = gemini_response.json()

            yield _sse({"event": "llm_completed"})
            await asyncio.sleep(0)

            llm_text = _extract_gemini_text(gemini_payload)
            generated_payload = _parse_llm_json(llm_text)

            headline = str(generated_payload.get("headline", ""))
            if headline.startswith("REFUSED"):
                yield _sse({"event": "error", "message": "Safety refusal"})
                await asyncio.sleep(0)
                _mark_generation_failed(
                    job_id=job_id_str,
                    product_id=product_id,
                    error_code="REFUSED",
                    error_message="Safety refusal",
                )
                return

            generated_payload["headline"] = (
                str(generated_payload.get("headline", "Your Storefront")).strip()
                or "Your Storefront"
            )

            benefits = generated_payload.get("benefits", [])
            if not isinstance(benefits, list):
                benefits = []
            normalized_benefits = [
                str(benefit).strip() for benefit in benefits if str(benefit).strip()
            ]
            if len(normalized_benefits) < 3:
                normalized_benefits.extend(
                    [
                        "High Quality Results - Crafted to look polished, trustworthy, and ready for immediate buyer conversion.",
                        "Instant Access Delivery - Purchase confirmation unlocks your asset flow without manual follow-up or delay.",
                        "Secure Checkout Journey - Clean payment handling keeps the buyer experience smooth, clear, and reliable.",
                    ]
                )
            generated_payload["benefits"] = normalized_benefits[:5]

            raw_tiers = generated_payload.get("tiers", [])
            if not isinstance(raw_tiers, list):
                raw_tiers = []
            corrected_tiers: list[dict[str, Any]] = []
            for idx, raw_tier in enumerate(raw_tiers):
                tier = raw_tier if isinstance(raw_tier, dict) else {}
                tier_name = str(tier.get("name", "")).strip() or f"Tier {idx + 1}"

                price_value = tier.get("price", 0)
                try:
                    parsed_price = int(price_value)
                except (TypeError, ValueError):
                    parsed_price = 0

                corrected_tiers.append(
                    {
                        "name": tier_name,
                        "price": max(0, parsed_price),
                        "description": str(tier.get("description", "A great tier")),
                    }
                )
            generated_payload["tiers"] = corrected_tiers

            normalized_tiers = _normalize_generated_tiers(generated_payload.get("tiers"))

            # Persist the LLM payload to the database
            supabase.table("products").update({"storefront_payload": generated_payload}).eq(
                "product_id", product_id
            ).execute()

            yield _sse({"event": "schema_validated"})
            await asyncio.sleep(0)

            tiers_to_insert: list[dict[str, Any]] = []
            for tier in normalized_tiers:
                tiers_to_insert.append(
                    {
                        "product_id": product_id,
                        "name": tier["name"],
                        "price": tier["price"],
                        "description": tier["description"],
                    }
                )

            if tiers_to_insert:
                supabase.table("tiers").insert(tiers_to_insert).execute()

            yield _sse({"event": "tiers_created"})
            await asyncio.sleep(0)

            supabase.table("products").update(
                {
                    "status": "links_ready",
                    "generation_error_code": None,
                    "generation_error_message": None,
                }
            ).eq("product_id", product_id).execute()
            supabase.table("jobs").update({"status": "succeeded"}).eq(
                "job_id", job_id_str
            ).execute()

            yield _sse({"event": "generation_complete"})
        except httpx.HTTPError:
            logger.exception("Gemini request failed for job_id=%s", job_id_str)
            _mark_generation_failed(
                job_id=job_id_str,
                product_id=product_id,
                error_code="GEMINI_REQUEST_FAILED",
                error_message="Gemini request failed.",
            )
            yield _sse({"event": "error", "message": "Generation failed"})
        except (json.JSONDecodeError, TypeError, ValueError, KeyError):
            logger.exception("LLM output parsing failed for job_id=%s", job_id_str)
            _mark_generation_failed(
                job_id=job_id_str,
                product_id=product_id,
                error_code="INVALID_LLM_OUTPUT",
                error_message="Failed to parse LLM output.",
            )
            yield _sse({"event": "error", "message": "Generation failed"})
        except HTTPException as exc:
            logger.exception("Generation pipeline failed for job_id=%s", job_id_str)
            _mark_generation_failed(
                job_id=job_id_str,
                product_id=product_id,
                error_code="GENERATION_HTTP_ERROR",
                error_message=str(exc.detail),
            )
            yield _sse({"event": "error", "message": str(exc.detail)})
        except Exception:
            logger.exception("Unexpected generation error for job_id=%s", job_id_str)
            _mark_generation_failed(
                job_id=job_id_str,
                product_id=product_id,
                error_code="GENERATION_INTERNAL_ERROR",
                error_message="Unexpected generation error.",
            )
            yield _sse({"event": "error", "message": "Generation failed"})

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/checkout/start")
async def checkout_start(payload: CheckoutStartRequest, response: Response) -> dict:
    try:
        tier_uuid = uuid.UUID(payload.tier_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid tier_id."
        ) from exc

    tier_result = (
        supabase.table("tiers")
        .select("tier_id,product_id,name,price,description")
        .eq("tier_id", str(tier_uuid))
        .limit(1)
        .execute()
    )
    tier_row = _extract_first_row(tier_result)
    if not tier_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tier not found."
        )

    checkout_session_id = uuid.uuid4()
    support_email = (os.getenv("SUPPORT_EMAIL") or "support@lunasai.local").strip()
    customer_name = (payload.customer_name or "").strip() or "Valued Customer"
    customer_email = (payload.customer_email or "").strip() or support_email
    customer_mobile = (payload.customer_mobile or "").strip() or "081234567890"
    try:
        amount = int(tier_row.get("price", 0))
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tier price is invalid for checkout.",
        ) from exc

    mayar_payload = {
        "name": tier_row.get("name", "LunasAI Checkout"),
        "amount": amount,
        "description": tier_row.get("description", "LunasAI digital product checkout"),
        "customerName": customer_name,
        "customerEmail": customer_email,
        "customerMobile": customer_mobile,
    }
    try:
        mayar_response = await _call_mayar(
            "https://api.mayar.id/hl/v1/payment/create", mayar_payload
        )
        payment_link_id, mayar_tx_id, checkout_url = _extract_mayar_checkout_fields(
            mayar_response
        )
    except Exception as exc:
        logger.exception(
            "Checkout Mayar request failed for tier_id=%s product_id=%s. Falling back to mock checkout URL.",
            tier_row.get("tier_id"),
            tier_row.get("product_id"),
        )
        print(f"Checkout Mayar fallback activated: {exc}")
        payment_link_id = f"mock_link_{uuid.uuid4().hex[:10]}"
        mayar_tx_id = f"mock_tx_{uuid.uuid4().hex[:10]}"
        checkout_url = "https://mayar.id/mock-checkout"

    supabase.table("tiers").update(
        {
            "mayar_payment_id": payment_link_id,
            "mayar_link": checkout_url,
        }
    ).eq("tier_id", str(tier_uuid)).execute()

    supabase.table("checkout_sessions").insert(
        {
            "checkout_session_id": str(checkout_session_id),
            "tier_id": str(tier_uuid),
            "product_id": tier_row["product_id"],
            "mayar_transaction_id": mayar_tx_id,
            "status": "created",
        }
    ).execute()

    is_production = (os.getenv("ENVIRONMENT") or "").lower() == "production"
    response.set_cookie(
        key="lunas_checkout",
        value=str(checkout_session_id),
        httponly=True,
        secure=True if is_production else False,
        samesite="lax",
        max_age=7200,
    )
    return {"checkout_url": checkout_url}


@router.get("/checkout/status")
async def checkout_status(request: Request) -> dict:
    checkout_session_id = request.cookies.get("lunas_checkout")
    if not checkout_session_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing checkout session cookie.",
        )

    session_result = (
        supabase.table("checkout_sessions")
        .select("status,delivery_token_plain")
        .eq("checkout_session_id", checkout_session_id)
        .limit(1)
        .execute()
    )
    session_row = _extract_first_row(session_result)
    if not session_row:
        return {"status": "pending"}

    session_status = session_row.get("status")
    delivery_token = session_row.get("delivery_token_plain")

    if session_status == "paid" and delivery_token:
        (
            supabase.table("checkout_sessions")
            .update({"delivery_token_plain": None})
            .eq("checkout_session_id", checkout_session_id)
            .eq("delivery_token_plain", delivery_token)
            .execute()
        )
        return {"status": "paid", "delivery_url": f"/d/{delivery_token}"}

    return {"status": "pending"}


@router.post("/webhooks/mayar")
async def mayar_webhook(request: Request, token: str = Query(default="")) -> dict:
    expected_token = os.getenv("WEBHOOK_SHARED_TOKEN") or ""
    if not token or not expected_token or not secrets.compare_digest(token, expected_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized."
        )

    try:
        payload = await request.json()
    except Exception:
        return {"status": "error", "error_code": "invalid_json_payload"}

    if payload.get("event") != "payment.received":
        return {"status": "ignored", "reason": "unhandled_event_type"}

    data = payload.get("data") or {}
    transaction_id = data.get("transactionId") or data.get("id")
    payment_link_id = data.get("paymentLinkId")
    customer_email = data.get("customerEmail")
    amount = data.get("amount")
    occurred_at = data.get("createdAt") or data.get("created_at")

    if not transaction_id or not payment_link_id or amount is None:
        return {"status": "error", "error_code": "invalid_payload"}

    try:
        parsed_amount = int(amount)
    except (TypeError, ValueError):
        return {"status": "error", "error_code": "invalid_amount"}

    logging.info(
        "Webhook received. tx=%s link=%s amount=%s",
        transaction_id,
        payment_link_id,
        parsed_amount,
    )

    rpc_result = (
        supabase.rpc(
            "process_mayar_webhook",
            {
                "p_event_id": transaction_id,
                "p_payment_link_id": payment_link_id,
                "p_customer_email": customer_email or "",
                "p_amount": parsed_amount,
                "p_occurred_at": occurred_at,
                "p_payload": payload,
            },
        ).execute()
    )

    rpc_data = getattr(rpc_result, "data", None)
    if isinstance(rpc_data, list):
        rpc_data = rpc_data[0] if rpc_data else {}

    if not isinstance(rpc_data, dict):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected RPC response.",
        )

    rpc_status = rpc_data.get("status")
    if rpc_status == "ok":
        update_payload: dict[str, Any] = {"status": "paid"}
        delivery_token = rpc_data.get("delivery_token")
        if delivery_token:
            update_payload["delivery_token_plain"] = delivery_token
        (
            supabase.table("checkout_sessions")
            .update(update_payload)
            .eq("mayar_transaction_id", transaction_id)
            .execute()
        )
        return {"status": "success"}

    if rpc_status == "duplicate":
        return {"status": "ok"}

    if rpc_status == "error":
        return {"status": "error", "error_code": rpc_data.get("error_code")}

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="unexpected_rpc_status",
    )


@router.post("/d/{delivery_token}/download")
async def download_delivery_token(delivery_token: str) -> dict:
    res = supabase.rpc(
        "consume_delivery_token", {"p_token_plain": delivery_token}
    ).execute()

    rpc_data = getattr(res, "data", {})
    if isinstance(rpc_data, list):
        rpc_data = rpc_data[0] if rpc_data else {}

    if not isinstance(rpc_data, dict):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected RPC response.",
        )

    if rpc_data.get("status") == "ok":
        return {
            "signed_download_url": "https://dummyimage.com/600x400/000/fff&text=Your+Digital+Download"
        }

    if rpc_data.get("status") == "error":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=rpc_data.get("error_code"),
        )

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="unexpected_rpc_status",
    )


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


app.include_router(router)
