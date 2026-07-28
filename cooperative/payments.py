"""
Paystack integration.
Thin wrapper around the Paystack REST API for real bank-account verification,
deposits (charge) and withdrawals (transfers). All money-moving state changes
must only be applied once Paystack's webhook confirms the transaction — never
from these initiate-only calls.

DEMO MODE: whenever PAYSTACK_SECRET_KEY is left blank (no real keys
configured), every function below simulates a successful response instead of
calling the real gateway, so the whole deposit/withdrawal/bank-linking flow
still works end-to-end with "demo money" while you sort out real Paystack
credentials. The moment you set real keys, this whole module goes back to
calling the real API automatically — no separate flag to remember to flip.
"""
import hashlib
import hmac
import uuid

import requests
from django.conf import settings

PAYSTACK_BASE_URL = "https://api.paystack.co"

DEMO_BANKS = [
    {"name": "Demo Bank (Access)", "code": "000014"},
    {"name": "Demo Bank (GTBank)", "code": "000013"},
    {"name": "Demo Bank (Zenith)", "code": "000015"},
    {"name": "Demo Bank (UBA)", "code": "000004"},
    {"name": "Demo Bank (First Bank)", "code": "000016"},
]


class PaystackError(Exception):
    pass


def is_demo_mode():
    return not settings.PAYSTACK_SECRET_KEY


def _headers():
    return {
        "Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}",
        "Content-Type": "application/json",
    }


def _request(method, path, **kwargs):
    resp = requests.request(method, f"{PAYSTACK_BASE_URL}{path}", headers=_headers(), timeout=15, **kwargs)
    data = resp.json()
    if not resp.ok or not data.get("status", False):
        raise PaystackError(data.get("message", f"Paystack request failed ({resp.status_code})"))
    return data["data"]


def list_banks(country="nigeria"):
    if is_demo_mode():
        return DEMO_BANKS
    return _request("GET", f"/bank?country={country}")


def resolve_account(account_number, bank_code):
    """Verify a bank account exists and return its registered account name."""
    if is_demo_mode():
        return {"account_number": account_number, "account_name": f"Demo Account {account_number[-4:]}"}
    return _request("GET", f"/bank/resolve?account_number={account_number}&bank_code={bank_code}")


def initialize_transaction(email, amount_naira, reference, callback_url=None):
    """Start a deposit. Amount is in Naira; Paystack expects kobo.

    In demo mode, returns no authorization_url — the caller (api_views.py)
    treats a missing authorization_url as "already completed" and credits
    the balance immediately instead of waiting for a webhook."""
    if is_demo_mode():
        return {"authorization_url": None, "access_code": None, "reference": reference, "demo": True}
    payload = {
        "email": email,
        "amount": int(round(float(amount_naira) * 100)),
        "reference": reference,
    }
    if callback_url:
        payload["callback_url"] = callback_url
    return _request("POST", "/transaction/initialize", json=payload)


def verify_transaction(reference):
    """Server-side confirmation of a deposit. Never trust the client redirect alone."""
    if is_demo_mode():
        return {"status": "success", "reference": reference}
    return _request("GET", f"/transaction/verify/{reference}")


def create_transfer_recipient(account_number, bank_code, name):
    if is_demo_mode():
        return {"recipient_code": f"DEMO-RCPT-{uuid.uuid4().hex[:12]}"}
    payload = {
        "type": "nuban",
        "name": name,
        "account_number": account_number,
        "bank_code": bank_code,
        "currency": "NGN",
    }
    return _request("POST", "/transferrecipient", json=payload)


def initiate_transfer(recipient_code, amount_naira, reference, reason="Withdrawal"):
    if is_demo_mode():
        return {"reference": reference, "status": "success", "demo": True}
    payload = {
        "source": "balance",
        "amount": int(round(float(amount_naira) * 100)),
        "recipient": recipient_code,
        "reference": reference,
        "reason": reason,
    }
    return _request("POST", "/transfer", json=payload)


def verify_webhook_signature(request_body: bytes, signature_header: str) -> bool:
    if not settings.PAYSTACK_SECRET_KEY or not signature_header:
        return False
    computed = hmac.new(
        settings.PAYSTACK_SECRET_KEY.encode("utf-8"),
        request_body,
        hashlib.sha512,
    ).hexdigest()
    return hmac.compare_digest(computed, signature_header)
