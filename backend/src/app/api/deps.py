from typing import Annotated

from fastapi import Depends

from app.core.config import Settings, get_settings
from app.db.client import get_supabase
from supabase import Client

# Depends just wraps the function
# Annotated[X, note] means "the type is X, with a note attached.
# this is essentially just the settings type but with extra info on how to get this type
SettingsDep = Annotated[Settings, Depends(get_settings)]

SupabaseDep = Annotated[Client, Depends(get_supabase)]
