from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import json

from .. import models, schemas, deps, database
from ..database import get_db

router = APIRouter(prefix="/custom-chatbots", tags=["Custom Chatbots"])

# ------------------------------------------------
# Create custom chatbot (org_admin only)
# ------------------------------------------------
@router.post("/", response_model=schemas.CustomChatbotResponse)
def create_custom_chatbot(
    payload: schemas.CustomChatbotCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_role("org_admin"))
):
    # Verify user exists in org
    linked_user = db.query(models.User).filter(
        models.User.id == payload.user_id,
        models.User.organization_id == current_user.organization_id
    ).first()
    if not linked_user:
        raise HTTPException(status_code=404, detail="Operator/User not found in your organization")

    db_bot = models.CustomChatbot(
        organization_id=current_user.organization_id,
        user_id=payload.user_id,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else "",
        goals=json.dumps(payload.goals or [])
    )
    db.add(db_bot)
    db.commit()
    db.refresh(db_bot)

    # Convert goals back to list for response schema
    if isinstance(db_bot.goals, str):
        try: db_bot.goals = json.loads(db_bot.goals)
        except: db_bot.goals = []
    
    return db_bot

# ------------------------------------------------
# List all custom chatbots in org (org_admin only)
# ------------------------------------------------
@router.get("/", response_model=List[schemas.CustomChatbotResponse])
def list_custom_chatbots(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_role("org_admin"))
):
    bots = db.query(models.CustomChatbot).filter(
        models.CustomChatbot.organization_id == current_user.organization_id
    ).all()

    for bot in bots:
        if isinstance(bot.goals, str):
            try: bot.goals = json.loads(bot.goals)
            except: bot.goals = []
    return bots

# ------------------------------------------------
# Get custom chatbots for currently logged-in user
# ------------------------------------------------
@router.get("/my-bots", response_model=List[schemas.CustomChatbotResponse])
def list_my_custom_chatbots(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    bots = db.query(models.CustomChatbot).filter(
        models.CustomChatbot.organization_id == current_user.organization_id,
        models.CustomChatbot.user_id == current_user.id
    ).all()

    for bot in bots:
        if isinstance(bot.goals, str):
            try: bot.goals = json.loads(bot.goals)
            except: bot.goals = []
    return bots

# ------------------------------------------------
# Edit custom chatbot (org_admin only)
# ------------------------------------------------
@router.put("/{bot_id}", response_model=schemas.CustomChatbotResponse)
def update_custom_chatbot(
    bot_id: int,
    payload: schemas.CustomChatbotCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_role("org_admin"))
):
    bot = db.query(models.CustomChatbot).filter(
        models.CustomChatbot.id == bot_id,
        models.CustomChatbot.organization_id == current_user.organization_id
    ).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Custom chatbot not found")

    # Verify user exists in org
    linked_user = db.query(models.User).filter(
        models.User.id == payload.user_id,
        models.User.organization_id == current_user.organization_id
    ).first()
    if not linked_user:
        raise HTTPException(status_code=404, detail="Operator/User not found in your organization")

    bot.user_id = payload.user_id
    bot.name = payload.name.strip()
    bot.description = payload.description.strip() if payload.description else ""
    bot.goals = json.dumps(payload.goals or [])

    db.commit()
    db.refresh(bot)

    if isinstance(bot.goals, str):
        try: bot.goals = json.loads(bot.goals)
        except: bot.goals = []

    return bot

# ------------------------------------------------
# Delete custom chatbot (org_admin only)
# ------------------------------------------------
@router.delete("/{bot_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_custom_chatbot(
    bot_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_role("org_admin"))
):
    bot = db.query(models.CustomChatbot).filter(
        models.CustomChatbot.id == bot_id,
        models.CustomChatbot.organization_id == current_user.organization_id
    ).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Custom chatbot not found")

    db.delete(bot)
    db.commit()
    return {"detail": "Custom chatbot deleted"}
