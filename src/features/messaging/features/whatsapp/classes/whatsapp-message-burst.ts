import { WhatsAppInboundMessage } from './whatsapp-inbound.message';

export class WhatsAppMessageBurst {
  private readonly _messages: WhatsAppInboundMessage[] = [];

  constructor(initialMessage: WhatsAppInboundMessage) {
    this._messages.push(initialMessage);
  }

  public addMessage(message: WhatsAppInboundMessage): void {
    this._messages.push(message);
  }

  /**
   * Retorna el último mensaje recibido en esta ráfaga.
   * Se utiliza como mensaje base para referencias de estado,
   * dado que representa la interacción más reciente del usuario.
   */
  public get baseMessage(): WhatsAppInboundMessage {
    return this._messages[this._messages.length - 1];
  }

  /**
   * Retorna todos los mensajes que componen la ráfaga.
   */
  public get messages(): WhatsAppInboundMessage[] {
    return [...this._messages];
  }

  /**
   * Agrega el texto de todos los mensajes en un único string,
   * omitiendo aquellos mensajes que no contengan texto.
   */
  public get aggregatedText(): string {
    return this._messages
      .map((msg) => msg.text?.trim() ?? '')
      .filter((text) => text.length > 0)
      .join('\n');
  }

  /**
   * Retorna el ID del remitente original
   */
  public get senderId(): string {
    return this._messages[0].senderId;
  }

  /**
   * Retorna el ID del destinatario original
   */
  public get recipientId(): string {
    return this._messages[0].recipientId;
  }
}
