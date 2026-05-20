import asyncio
import logging
from fastapi import APIRouter, HTTPException
from remex.core import __version__, SUPPORTED_EXTENSIONS, PROVIDERS, detect_provider
from remex.core.ai import list_custom_provider_models
from remex.api.schemas import (
    HealthResponse,
    InfoResponse,
    TestCustomProviderRequest,
    TestCustomProviderResponse,
)

router = APIRouter(tags=["system"])
_logger = logging.getLogger("remex.core")


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", version=__version__)


@router.get("/info", response_model=InfoResponse)
async def info() -> InfoResponse:
    provider = await asyncio.to_thread(detect_provider)
    return InfoResponse(
        version=__version__,
        supported_extensions=sorted(SUPPORTED_EXTENSIONS),
        providers=list(PROVIDERS),
        detected_provider=provider,
    )


@router.post("/system/test-custom-provider", response_model=TestCustomProviderResponse)
async def test_custom_provider(req: TestCustomProviderRequest) -> TestCustomProviderResponse:
    """Probe an OpenAI-compatible endpoint and return its available models.

    Used by the Studio "Test connection" button in Settings → AI → Custom
    providers. Goes through the same Python HTTP stack the real chat call
    uses, so corporate proxies + CA bundles are honoured here too.
    """
    try:
        models = await asyncio.to_thread(
            list_custom_provider_models,
            base_url=req.base_url,
            api_key=req.api_key,
            header_name=req.header_name or "Authorization",
            header_prefix=req.header_prefix if req.header_prefix is not None else "Bearer ",
        )
    except RuntimeError as e:
        # Network / auth / parse error — surface as 502 so the UI shows the diagnostic.
        _logger.info("[test-custom-provider] failed for %s: %s", req.base_url, e)
        raise HTTPException(status_code=502, detail=str(e))
    return TestCustomProviderResponse(models=models)
