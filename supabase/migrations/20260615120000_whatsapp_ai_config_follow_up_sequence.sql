-- Add the follow_up_sequence column expected by the WhatsApp AI agent config.
-- The settings UI (WhatsAppAISettings) sends `follow_up_sequence` and the agent
-- (lib/evolution/aiAgent.ts + followUpProcessor.ts) reads it, but the column was
-- missing from the table — so every save of the AI agent config failed silently
-- (upsert into a non-existent column), which also prevented lead scoring and
-- auto-labeling from running. Adding it makes the config persist.

ALTER TABLE whatsapp_ai_config
  ADD COLUMN IF NOT EXISTS follow_up_sequence jsonb NOT NULL DEFAULT
    '[{"delay_minutes":30,"label":"Primeiro contato"},{"delay_minutes":60,"label":"Segundo contato"},{"delay_minutes":180,"label":"Terceiro contato"}]'::jsonb;
