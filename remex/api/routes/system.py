from fastapi import APIRouter
from remex.core import __version__, SUPPORTED_EXTENSIONS, PROVIDERS, detect_provider
from remex.api.schemas import HealthResponse, InfoResponse

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", version=__version__)


@router.get("/info", response_model=InfoResponse)
def info() -> InfoResponse:
    return InfoResponse(
        version=__version__,
        supported_extensions=sorted(SUPPORTED_EXTENSIONS),
        providers=list(PROVIDERS),
        detected_provider=detect_provider(),
    )
