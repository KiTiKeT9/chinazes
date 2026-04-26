import React from 'react';

// Minimal monochrome brand marks. We paint them with `currentColor` so the
// sidebar can color them per-service.

export function TelegramIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" {...props}>
      <path d="M21.94 4.66c.29-1.34-.49-1.86-1.39-1.52L2.69 9.99c-1.23.48-1.21 1.17-.21 1.48l4.61 1.44 1.78 5.36c.18.49.34.67.71.67.27 0 .39-.12.55-.27l2.21-2.13 4.6 3.4c.84.47 1.45.23 1.66-.78l3.34-15.5zm-7.84 7.13L7.6 17.21l-.36-2.84 9.32-8.42c.41-.36-.09-.55-.62-.2L4.45 13.16l-2.04-.64L19.7 5.61l-5.6 6.18z" />
    </svg>
  );
}

export function DiscordIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" {...props}>
      <path d="M19.54 5.56A18.16 18.16 0 0 0 15.1 4.2a.07.07 0 0 0-.07.03c-.19.34-.4.78-.55 1.12a16.78 16.78 0 0 0-4.96 0 11.36 11.36 0 0 0-.56-1.12.07.07 0 0 0-.07-.03A18.1 18.1 0 0 0 4.45 5.56a.06.06 0 0 0-.03.02C1.63 9.66.9 13.63 1.26 17.56a.08.08 0 0 0 .03.05 18.3 18.3 0 0 0 5.48 2.75.07.07 0 0 0 .08-.03c.42-.57.8-1.17 1.12-1.8a.07.07 0 0 0-.04-.1c-.6-.22-1.17-.5-1.72-.81a.07.07 0 0 1 0-.12c.11-.09.23-.18.34-.27a.07.07 0 0 1 .07 0c3.6 1.64 7.5 1.64 11.05 0a.07.07 0 0 1 .07 0c.11.1.23.19.35.27.06.05.06.15 0 .12-.55.32-1.13.6-1.72.81a.07.07 0 0 0-.04.1c.33.63.71 1.23 1.12 1.8a.07.07 0 0 0 .08.03 18.24 18.24 0 0 0 5.48-2.75.07.07 0 0 0 .03-.05c.43-4.54-.72-8.48-3.07-11.98a.05.05 0 0 0-.03-.02ZM8.52 15.17c-1.08 0-1.96-.99-1.96-2.2 0-1.22.86-2.21 1.96-2.21 1.1 0 1.98 1 1.96 2.2 0 1.22-.87 2.21-1.96 2.21Zm6.97 0c-1.07 0-1.96-.99-1.96-2.2 0-1.22.86-2.21 1.96-2.21 1.1 0 1.98 1 1.96 2.2 0 1.22-.86 2.21-1.96 2.21Z" />
    </svg>
  );
}

export function YoutubeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" {...props}>
      <path d="M23.5 7.1a3 3 0 0 0-2.1-2.1C19.6 4.5 12 4.5 12 4.5s-7.6 0-9.4.5A3 3 0 0 0 .5 7.1 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 4.9 3 3 0 0 0 2.1 2.1c1.8.5 9.4.5 9.4.5s7.6 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-4.9ZM9.75 15.5v-7l6.5 3.5-6.5 3.5Z" />
    </svg>
  );
}

export function TiktokIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" {...props}>
      <path d="M16.5 3.5c.3 1.9 1.4 3.4 3 4.2.8.4 1.7.6 2.6.6v3.2c-1.7.1-3.4-.4-4.9-1.2-.6-.3-1.1-.7-1.6-1.1v7.3c0 4-3.3 7.2-7.3 7.2a7.2 7.2 0 1 1 .5-14.4v3.3a4 4 0 1 0 3.5 4V3.5h4.2Z" />
    </svg>
  );
}

export function SteamIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" {...props}>
      <path d="M12 2a10 10 0 0 0-9.94 8.9l5.38 2.22a2.85 2.85 0 0 1 1.6-.48h.15l2.4-3.46v-.05a3.8 3.8 0 1 1 3.81 3.82h-.09l-3.4 2.43a2.84 2.84 0 0 1-5.66.3L2.12 14a10 10 0 1 0 9.88-12Zm-4.7 15.13-1.24-.51a2.15 2.15 0 1 0 1.25.5Zm9.25-6.55a2.54 2.54 0 1 0-2.54-2.54 2.54 2.54 0 0 0 2.54 2.54Z" />
    </svg>
  );
}

export function GoogleIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" {...props}>
      <path fill="#4285F4" d="M21.6 12.23c0-.73-.07-1.43-.19-2.1H12v4h5.38a4.6 4.6 0 0 1-2 3.02v2.52h3.24c1.9-1.74 3-4.31 3-7.44Z"/>
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.89 6.62-2.42l-3.24-2.52c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.6-4.12H3.07v2.6A10 10 0 0 0 12 22Z"/>
      <path fill="#FBBC05" d="M6.4 13.9a5.98 5.98 0 0 1 0-3.82V7.48H3.06a10 10 0 0 0 0 9.02L6.4 13.9Z"/>
      <path fill="#EA4335" d="M12 5.98c1.47 0 2.78.5 3.82 1.5l2.86-2.87C16.96 2.99 14.7 2 12 2a10 10 0 0 0-8.94 5.48L6.4 10.08c.8-2.36 3-4.1 5.6-4.1Z"/>
    </svg>
  );
}

export function GmailIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" {...props}>
      <path fill="#4285F4" d="M22 7.4v10.1a2 2 0 0 1-2 2h-2.4V11l-5.6 4.1L6.4 11v8.5H4a2 2 0 0 1-2-2V7.4l1.6-1.2L12 12.4l8.4-6.2L22 7.4Z"/>
      <path fill="#34A853" d="M22 7.4V5.5A1.5 1.5 0 0 0 19.7 4.3L17.6 5.8v5.2L22 7.4Z"/>
      <path fill="#FBBC04" d="M2 7.4V5.5A1.5 1.5 0 0 1 4.3 4.3L6.4 5.8v5.2L2 7.4Z"/>
      <path fill="#EA4335" d="M6.4 5.8 12 9.9l5.6-4.1V11l-5.6 4.1L6.4 11V5.8Z"/>
      <path fill="#C5221F" d="M6.4 5.8 12 9.9l5.6-4.1.1-.1V4.3a.5.5 0 0 0-.8-.4L12 7 7.1 3.9a.5.5 0 0 0-.8.4v1.4l.1.1Z"/>
    </svg>
  );
}

export function ReloadIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 12a9 9 0 0 1 15.6-6.1" />
      <path d="M21 4v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.6 6.1" />
      <path d="M3 20v-5h5" />
    </svg>
  );
}

export function SettingsIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.3 16.7l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7.3 4.3l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1A2 2 0 1 1 19.7 7l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}

export function NotesIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </svg>
  );
}

export function ShieldIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    </svg>
  );
}

export function TwitchIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" {...props}>
      <path d="M4 2 2 6v14h5v3h3l3-3h4l5-5V2H4Zm16 11-3 3h-5l-3 3v-3H6V4h14v9ZM11 8h2v6h-2V8Zm5 0h2v6h-2V8Z"/>
    </svg>
  );
}

export function VKIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" {...props}>
      <path d="M12.785 16.241s.288-.032.435-.193c.135-.148.131-.425.131-.425s-.019-1.302.581-1.494c.59-.19 1.347 1.265 2.151 1.825.608.422 1.07.33 1.07.33l2.149-.03s1.124-.07.59-.957c-.043-.072-.31-.654-1.601-1.857-1.349-1.255-1.169-1.052.456-3.222.989-1.32 1.385-2.126 1.262-2.471-.118-.328-.846-.241-.846-.241l-2.42.015s-.18-.025-.312.054c-.13.077-.214.257-.214.257s-.382 1.02-.892 1.887c-1.073 1.832-1.502 1.928-1.677 1.815-.408-.264-.306-1.064-.306-1.633 0-1.776.27-2.515-.523-2.706-.264-.063-.458-.105-1.13-.112-.864-.009-1.595.003-2.009.206-.275.135-.488.436-.358.453.16.022.523.099.715.36.249.337.24 1.092.24 1.092s.142 2.083-.336 2.341c-.328.177-.778-.184-1.735-1.846-.49-.85-.86-1.79-.86-1.79s-.072-.176-.198-.27c-.154-.114-.37-.151-.37-.151l-2.3.015s-.346.01-.473.16c-.114.134-.009.41-.009.41s1.802 4.215 3.842 6.34c1.872 1.948 3.998 1.82 3.998 1.82h.962Z"/>
    </svg>
  );
}

export function InstagramIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
    </svg>
  );
}

export function XIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}

export function SpotifyIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" {...props}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.586 14.424a.622.622 0 0 1-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 1 1-.277-1.215c3.809-.871 7.077-.496 9.713 1.115.293.18.387.563.206.857zm1.223-2.722a.78.78 0 0 1-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 1 1-.453-1.494c3.633-1.102 8.147-.568 11.234 1.331.366.225.482.706.256 1.072zm.105-2.835c-3.223-1.914-8.54-2.09-11.618-1.156a.935.935 0 1 1-.542-1.79c3.532-1.072 9.404-.865 13.115 1.338a.936.936 0 0 1-.955 1.609z"/>
    </svg>
  );
}

export function YandexMusicIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" {...props}>
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8Zm-1-13v8.27a3 3 0 1 0 2 2.83V9h2V7Z"/>
    </svg>
  );
}

export function BrandIcon({ id, ...props }) {
  switch (id) {
    case 'telegram': return <TelegramIcon {...props} />;
    case 'discord':  return <DiscordIcon {...props} />;
    case 'youtube':  return <YoutubeIcon {...props} />;
    case 'tiktok':   return <TiktokIcon {...props} />;
    case 'steam':    return <SteamIcon {...props} />;
    case 'google':   return <GoogleIcon {...props} />;
    case 'gmail':    return <GmailIcon {...props} />;
    case 'twitch':   return <TwitchIcon {...props} />;
    case 'vk':       return <VKIcon {...props} />;
    case 'instagram':return <InstagramIcon {...props} />;
    case 'x':        return <XIcon {...props} />;
    case 'spotify':  return <SpotifyIcon {...props} />;
    case 'yamusic':  return <YandexMusicIcon {...props} />;
    default:         return null;
  }
}
