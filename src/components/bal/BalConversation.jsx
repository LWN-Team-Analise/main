import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronRight, Mail, MapPin, Phone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { FaWhatsapp } from 'react-icons/fa6';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../i18n/language';
import { useStrings } from '../../i18n/strings';
import { topicsFor } from './balTopics';

const EASE = [0.22, 1, 0.36, 1];
const TYPING_MS = 650; // how long BAL "types" before an answer appears
const CHANNEL_ICONS = { whatsapp: FaWhatsapp, phone: Phone, email: Mail };
const external = { target: '_blank', rel: 'noopener noreferrer' };

/** One piece of an answer (see the block types in balTopics.js). */
function Block({ block }) {
  const copy = useStrings();
  switch (block.type) {
    case 'text':
      return <p>{block.text}</p>;
    case 'html':
      // First-party article markup from src/data/posts.js, rendered as on the article page.
      return <p dangerouslySetInnerHTML={{ __html: block.html }} />;
    case 'list':
      return (
        <ul className="bal-answer__list">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case 'htmlList':
      return (
        <ul className="bal-answer__list">
          {block.items.map((item) => (
            <li key={item} dangerouslySetInnerHTML={{ __html: item }} />
          ))}
        </ul>
      );
    case 'timeline':
      return (
        <ol className="bal-answer__timeline">
          {block.items.map((item) => (
            <li key={item.when}>
              <span>{item.when}</span>
              {item.what}
            </li>
          ))}
        </ol>
      );
    case 'stats':
      return (
        <ul className="bal-answer__stats">
          {block.items.map((item) => (
            <li key={item.label}>
              <strong>{item.value}</strong>
              {item.label}
            </li>
          ))}
        </ul>
      );
    case 'figure':
      return (
        <p className="bal-answer__figure">
          <strong>{block.value}</strong> {block.text}
        </p>
      );
    case 'groups':
      return (
        <ul className="bal-answer__groups">
          {block.items.map((item) => (
            <li key={item.title}>
              <strong>{item.title}</strong>
              {item.text}
            </li>
          ))}
        </ul>
      );
    case 'channels':
      return (
        <ul className="bal-answer__channels">
          {block.items.map(({ id, label, value, href, external: isExternal }) => {
            const Icon = CHANNEL_ICONS[id];
            return (
              <li key={id}>
                <a href={href} {...(isExternal ? external : {})}>
                  <Icon size={16} aria-hidden="true" />
                  <span>
                    <small>{label}</small>
                    {value}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      );
    case 'offices':
      return (
        <ul className="bal-answer__offices">
          {block.items.map((office) => (
            <li key={office.city}>
              <MapPin size={15} aria-hidden="true" />
              <span>
                <strong>{office.city}</strong>
                {office.lines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
                <a href={office.map} {...external}>
                  {copy.bal.onMap} <ArrowUpRight size={13} aria-hidden="true" />
                </a>
              </span>
            </li>
          ))}
        </ul>
      );
    default:
      return null;
  }
}

/**
 * BAL's conversation: a greeting with the list of topics; choosing one shows
 * the question as the visitor's message, a moment of "typing", then BAL's
 * answer with links to where the site covers the topic in full, and a way
 * back to the list. Following a link to another part of the site calls
 * `onNavigate` (the panel closes so the page is in view).
 */
export default function BalConversation({ onNavigate }) {
  const [topicId, setTopicId] = useState(null);
  const [typing, setTyping] = useState(false);
  const reduce = useReducedMotion();
  const bodyRef = useRef(null);
  const backRef = useRef(null);
  // Going back puts the focus on the topic just read, once the list is back on screen.
  const returnTo = useRef(null);

  const copy = useStrings();
  const topics = topicsFor(useLanguage());
  const topic = topics.find((item) => item.id === topicId);

  // A short "typing" pause before each answer (none with reduced motion).
  useEffect(() => {
    if (!topicId || reduce) return undefined;
    setTyping(true);
    const timer = setTimeout(() => setTyping(false), TYPING_MS);
    return () => clearTimeout(timer);
  }, [topicId, reduce]);

  // Each view starts at the top; an answer puts the keyboard focus on the way back.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    if (topicId) backRef.current?.focus({ preventScroll: true });
  }, [topicId]);

  const back = () => {
    returnTo.current = topicId;
    setTopicId(null);
  };

  const view = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE } },
        exit: { opacity: 0, y: -6, transition: { duration: 0.16 } },
      };

  return (
    <div className="bal-chat">
      <div ref={bodyRef} className="bal-chat__body">
        <AnimatePresence mode="wait" initial={false}>
          {topic ? (
            <motion.div key={topic.id} className="bal-chat__thread" {...view}>
              <p className="bal-msg bal-msg--user">{topic.label}</p>
              <div aria-live="polite" aria-busy={typing}>
                {typing ? (
                  <p className="bal-msg bal-msg--bot bal-typing" aria-label={copy.bal.typing}>
                    <span />
                    <span />
                    <span />
                  </p>
                ) : (
                  <motion.div
                    className="bal-msg bal-msg--bot bal-answer"
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0, transition: { duration: 0.36, ease: EASE } }}
                  >
                    {topic.answer.map((block, i) => (
                      <Block key={i} block={block} />
                    ))}
                    {topic.links.length > 0 && (
                      <p className="bal-answer__links">
                        {topic.links.map((link) => (
                          <Link key={link.label} to={link.to} className="bal-link" onClick={onNavigate}>
                            {link.label}
                            <ArrowRight size={15} aria-hidden="true" />
                          </Link>
                        ))}
                      </p>
                    )}
                  </motion.div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div key="menu" className="bal-chat__thread" {...view}>
              <div className="bal-msg bal-msg--bot">
                {copy.bal.greeting.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
              <ul className="bal-topics" aria-label={copy.bal.topics}>
                {topics.map(({ id, label, Icon }) => (
                  <li key={id}>
                    <button
                      ref={(el) => {
                        if (el && returnTo.current === id) {
                          returnTo.current = null;
                          el.focus({ preventScroll: true });
                        }
                      }}
                      type="button"
                      className="bal-topic"
                      onClick={() => setTopicId(id)}
                    >
                      <span className="bal-topic__icon" aria-hidden="true">
                        <Icon size={17} />
                      </span>
                      <span className="bal-topic__label">{label}</span>
                      <ChevronRight className="bal-topic__chevron" size={16} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {topic && (
        <div className="bal-chat__foot">
          <button ref={backRef} type="button" className="bal-back" onClick={back}>
            <ArrowLeft size={16} aria-hidden="true" />
            {copy.bal.back}
          </button>
        </div>
      )}
    </div>
  );
}
