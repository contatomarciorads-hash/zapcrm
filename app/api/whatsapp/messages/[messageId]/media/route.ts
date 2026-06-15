import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getInstance } from '@/lib/supabase/whatsapp';
import { getEvolutionCredentials } from '@/lib/evolution/helpers';
import * as evolution from '@/lib/evolution/client';

type Params = { params: Promise<{ messageId: string }> };

/**
 * GET /api/whatsapp/messages/[messageId]/media
 *
 * Streams the decrypted media (audio, image, video, sticker, document) for a
 * WhatsApp message. WhatsApp media URLs stored on the message are encrypted
 * (`.enc`) and cannot be played/shown directly in the browser — this endpoint
 * fetches the decrypted bytes from the Evolution API on demand and serves them
 * with the correct content type.
 */
export async function GET(_request: Request, { params }: Params) {
  const { messageId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();
  if (!profile?.organization_id) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  // Load the message (scoped to the caller's organization).
  const { data: message } = await supabase
    .from('whatsapp_messages')
    .select('id, organization_id, conversation_id, evolution_message_id, media_mime_type')
    .eq('id', messageId)
    .eq('organization_id', profile.organization_id)
    .maybeSingle();

  if (!message || !message.evolution_message_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Resolve the WhatsApp instance via the conversation.
  const { data: conversation } = await supabase
    .from('whatsapp_conversations')
    .select('instance_id')
    .eq('id', message.conversation_id)
    .maybeSingle();
  if (!conversation?.instance_id) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const instance = await getInstance(supabase, conversation.instance_id);
  if (!instance || instance.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }

  try {
    const creds = await getEvolutionCredentials(supabase, instance);
    const media = await evolution.getBase64FromMedia(creds, message.evolution_message_id);

    if (!media?.base64) {
      return NextResponse.json({ error: 'Media unavailable' }, { status: 404 });
    }

    const bytes = Buffer.from(media.base64, 'base64');
    const contentType = media.mimetype || message.media_mime_type || 'application/octet-stream';

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(bytes.length),
        // Decrypted media is stable for a given message — cache privately.
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (err) {
    console.error('[whatsapp-media] Failed to fetch media for message', messageId, err);
    return NextResponse.json({ error: 'Falha ao carregar mídia' }, { status: 502 });
  }
}
