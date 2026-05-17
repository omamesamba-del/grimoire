from aiohttp import web
from server import PromptServer

from .state import slot_state, gen_params, known_slots
from .slot_node import (
    NODE_CLASS_MAPPINGS        as _SLOT_MAPS,
    NODE_DISPLAY_NAME_MAPPINGS as _SLOT_DISPLAY,
)
from .gen_node import (
    NODE_CLASS_MAPPINGS        as _GEN_MAPS,
    NODE_DISPLAY_NAME_MAPPINGS as _GEN_DISPLAY,
)

NODE_CLASS_MAPPINGS        = {**_SLOT_MAPS,   **_GEN_MAPS}
NODE_DISPLAY_NAME_MAPPINGS = {**_SLOT_DISPLAY, **_GEN_DISPLAY}
WEB_DIRECTORY              = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]

# ── HTTP Routes ────────────────────────────────────────────────────────────
routes = PromptServer.instance.routes


@routes.get("/pb/health")
async def pb_health(request):
    return web.json_response({"ok": True, "version": "2.0"})


# ── Slot endpoints ─────────────────────────────────────────────────────────

@routes.get("/pb/slots")
async def pb_get_slots(request):
    return web.json_response({"success": True, "slots": sorted(known_slots)})


@routes.post("/pb/register-slots")
async def pb_register_slots(request):
    data = await request.json()
    for s in data.get("slots", []):
        if s:
            known_slots.add(s)
    return web.json_response({"success": True})


@routes.post("/pb/set-slot")
async def pb_set_slot(request):
    data = await request.json()
    slot    = data.get("slot", "")
    text    = data.get("text", "")
    trigger = data.get("trigger", False)

    if slot:
        slot_state[slot] = text
        known_slots.add(slot)
        await PromptServer.instance.send_json("pb:slot-updated", {"slot": slot, "text": text})

    if trigger:
        await PromptServer.instance.send_json("pb:trigger", {})

    return web.json_response({"success": True})


@routes.get("/pb/get-slot")
async def pb_get_slot(request):
    slot = request.rel_url.query.get("slot", "")
    return web.json_response({
        "success": True,
        "slot": slot,
        "text": slot_state.get(slot, ""),
    })


# ── Gen endpoints ──────────────────────────────────────────────────────────

@routes.post("/pb/set-gen")
async def pb_set_gen(request):
    data = await request.json()
    data.pop("slot", None)  # slot キーは不要なので除去
    gen_params.clear()
    gen_params.update(data)
    await PromptServer.instance.send_json("pb:gen-updated", dict(gen_params))
    return web.json_response({"success": True})


@routes.get("/pb/get-gen")
async def pb_get_gen(request):
    return web.json_response({"success": True, "gen": dict(gen_params)})


# ── Control endpoints ──────────────────────────────────────────────────────

@routes.post("/pb/request-scan")
async def pb_request_scan(request):
    # JS 拡張 (pb_bridge.js) に pb:request-scan イベントを送信
    # → JS 側がグラフを走査して /pb/register-slots を呼ぶ
    await PromptServer.instance.send_json("pb:request-scan", {})
    return web.json_response({"success": True})


@routes.post("/pb/trigger")
async def pb_trigger(request):
    # JS 拡張 (pb_bridge.js) に pb:trigger イベントを送信
    # → JS 側が app.queuePrompt() を呼ぶ
    await PromptServer.instance.send_json("pb:trigger", {})
    return web.json_response({"success": True})
