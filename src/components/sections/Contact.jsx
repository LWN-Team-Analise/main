import { ArrowUpRight, Mail, Phone } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa6';
import { company, contact } from '../../data/site';
import Reveal from '../ui/Reveal';
import './Contact.css';

const CHANNELS = [
  { id: 'whatsapp', label: 'WhatsApp', value: company.phoneDisplay, href: company.whatsappHref, Icon: FaWhatsapp, external: true },
  { id: 'phone', label: 'Telefone', value: company.phoneDisplay, href: company.phoneHref, Icon: Phone },
  { id: 'email', label: 'E-mail', value: company.email, href: `mailto:${company.email}`, Icon: Mail },
];

export default function Contact() {
  return (
    <section id="contato" className="contact" data-theme="dark" aria-labelledby="contato-title">
      <div className="container contact__grid">
        <Reveal className="contact__head">
          <p className="eyebrow eyebrow--dark">
            <span className="eyebrow__index">09</span>
            Contato
          </p>
          <h2 className="contact__title" id="contato-title">
            {contact.title}
          </h2>
          <p className="contact__lead">{contact.lead}</p>
        </Reveal>

        <ul className="contact__channels">
          {CHANNELS.map(({ id, label, value, href, Icon, external }, i) => (
            <Reveal as="li" key={id} delay={0.06 * i}>
              <a className="channel" href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                <span className="channel__icon" aria-hidden="true">
                  <Icon size={20} />
                </span>
                <span className="channel__text">
                  <span className="channel__label">{label}</span>
                  <span className="channel__value">{value}</span>
                </span>
                <ArrowUpRight className="channel__arrow" size={18} aria-hidden="true" />
              </a>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
