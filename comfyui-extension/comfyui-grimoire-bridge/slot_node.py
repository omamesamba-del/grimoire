from .state import slot_state, known_slots


class PromptBuilderSlot:
    """
    Single-text slot node controlled by Prompt Builder.
    Place one node per text area (e.g. "positive", "negative", "chara").
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "slot_name": ("STRING", {"default": "positive"}),
                "text":      ("STRING", {"default": "", "multiline": True}),
            }
        }

    RETURN_TYPES  = ("STRING",)
    RETURN_NAMES  = ("text",)
    FUNCTION      = "execute"
    CATEGORY      = "PromptBuilder"
    DESCRIPTION   = "Text slot controlled by Prompt Builder. Connect to any STRING input."

    @classmethod
    def IS_CHANGED(cls, slot_name, text):
        return slot_state.get(slot_name.strip(), text)

    def execute(self, slot_name: str, text: str) -> tuple:
        name = slot_name.strip()
        if name:
            known_slots.add(name)
        val = slot_state.get(name)
        return (val if val is not None else text,)


class PromptBuilderJoin:
    """
    Joins any number of text strings with a configurable separator.
    Click + in the node to add more inputs. Empty inputs are skipped.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "separator": ("STRING", {"default": ", "}),
            },
            "optional": {
                "text_1": ("STRING", {"forceInput": True}),
            }
        }

    RETURN_TYPES  = ("STRING",)
    RETURN_NAMES  = ("text",)
    FUNCTION      = "execute"
    CATEGORY      = "PromptBuilder"
    DESCRIPTION   = "Joins any number of text strings. Use + to add inputs. Empty inputs are skipped."

    def execute(self, separator: str = ", ", **kwargs) -> tuple:
        parts = []
        i = 1
        while f"text_{i}" in kwargs:
            t = (kwargs[f"text_{i}"] or "").strip()
            if t:
                parts.append(t)
            i += 1
        return ((separator or ", ").join(parts),)


NODE_CLASS_MAPPINGS = {
    "PromptBuilderSlot": PromptBuilderSlot,
    "PromptBuilderJoin": PromptBuilderJoin,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "PromptBuilderSlot": "PB Slot",
    "PromptBuilderJoin": "PB Join",
}
