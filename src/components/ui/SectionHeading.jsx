import Reveal from './Reveal';
import './SectionHeading.css';

export default function SectionHeading({ index, eyebrow, title, lead, tone = 'light', align = 'start', id }) {
  return (
    <Reveal className={`section-heading section-heading--${tone} section-heading--${align}`}>
      <p className={`eyebrow${tone === 'dark' ? ' eyebrow--dark' : ''}`}>
        {index && <span className="eyebrow__index">{index}</span>}
        {eyebrow}
      </p>
      <h2 className="section-heading__title" id={id}>
        {title}
      </h2>
      {lead && <p className="section-heading__lead">{lead}</p>}
    </Reveal>
  );
}
