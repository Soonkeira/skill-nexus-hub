from pydantic import BaseModel


class PaginatedResponse(BaseModel):
    page: int
    page_size: int
    total: int
