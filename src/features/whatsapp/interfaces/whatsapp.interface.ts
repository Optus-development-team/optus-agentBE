

export interface SendMessageDto {
  to: string;
  type: 'text' | 'template' | 'image' | 'video' | 'audio' | 'document';
  text?: {
    preview_url?: boolean;
    body: string;
  };
  template?: {
    name: string;
    language: {
      code: string;
    };
    components?: any[];
  };
  image?: {
    link?: string;
    caption?: string;
    id?: string;
  };
  video?: {
    link?: string;
    caption?: string;
    id?: string;
  };
  audio?: {
    link?: string;
    id?: string;
  };
  document?: {
    link?: string;
    caption?: string;
    filename?: string;
    id?: string;
  };
}
