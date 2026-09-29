import { CLIENT_LOGOS, logoUrl } from '../../data/clients';

/**
 * White client mark, sized by visual area rather than by height, so a wide
 * wordmark and a square emblem feel equally present in a row.
 */
export default function ClientLogo({ id, area = 3400, min = 22, max = 46, lazy = true }) {
  const logo = CLIENT_LOGOS[id];
  if (!logo) return null;
  const ratio = logo.w / logo.h;
  const height = Math.round(Math.min(max, Math.max(min, Math.sqrt(area / ratio))));
  const width = Math.round(height * ratio);
  return (
    <img
      className="client-logo"
      src={logoUrl(id)}
      alt={logo.name}
      title={logo.name}
      width={width}
      height={height}
      style={{ width, height }}
      loading={lazy ? 'lazy' : 'eager'}
      decoding="async"
      draggable="false"
    />
  );
}
