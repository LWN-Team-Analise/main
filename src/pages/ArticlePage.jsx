import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PostCard from '../components/blog/PostCard';
import { formatDate, postImage } from '../components/blog/postUtils';
import { getPost, POSTS } from '../data/posts';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import NotFoundPage from './NotFoundPage';
import './Blog.css';

const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

// Article bodies are migrated WordPress content, already reduced to a small
// whitelist of inline tags (strong, em, a) by the migration script.
function Block({ block }) {
  switch (block.type) {
    case 'h':
      return <h2>{block.text}</h2>;
    case 'p':
      return <p dangerouslySetInnerHTML={{ __html: block.html }} />;
    case 'callout':
      return <p className="article__callout" dangerouslySetInnerHTML={{ __html: block.html }} />;
    case 'ul':
    case 'ol': {
      const List = block.type;
      return (
        <List>
          {block.items.map((item, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
          ))}
        </List>
      );
    }
    default:
      return null;
  }
}

export default function ArticlePage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const post = getPost(slug);
  useDocumentTitle(post?.title ?? 'Artigo não encontrado');
  if (!post) return <NotFoundPage />;

  const others = POSTS.filter((p) => p.slug !== post.slug);

  // Links inside the migrated HTML are plain anchors: keep internal ones in the app.
  const handleProseClick = (event) => {
    const link = event.target.closest('a');
    if (link && link.origin === window.location.origin) {
      event.preventDefault();
      navigate(link.pathname + link.hash);
    }
  };

  return (
    <article className="article">
      <header className="article__hero" data-theme="dark">
        <div className="container article__hero-inner">
          <Link to="/blog" className="back-link">
            <ArrowLeft size={16} aria-hidden="true" />
            Todos os artigos
          </Link>
          <p className="article__meta">
            <span className="post-card__tag">{post.tag}</span>
            <time dateTime={post.date}>{formatDate(post.date)}</time>
            <span aria-hidden="true">·</span>
            <span>{post.readingMinutes} min de leitura</span>
          </p>
          <h1 className="article__title">{post.title}</h1>
          {post.author && (
            <p className="article__byline">
              <span className="article__avatar" aria-hidden="true">
                {initials(post.author)}
              </span>
              <span>
                Por <strong>{post.author}</strong>
                <span className="article__byline-org">LWN Engenharia</span>
              </span>
            </p>
          )}
        </div>
      </header>

      <div className="article__cover" data-theme="light">
        <div className="container">
          <img
            src={postImage(post, 1200)}
            srcSet={`${postImage(post, 640)} 640w, ${postImage(post, 1200)} 1200w`}
            sizes="(max-width: 900px) 100vw, 860px"
            alt=""
            width={post.imageWidth}
            height={post.imageHeight}
            fetchPriority="high"
          />
        </div>
      </div>

      <div className="article__body" data-theme="light">
        <div className="container article__prose" onClick={handleProseClick}>
          {post.blocks.map((block, i) => (
            <Block key={i} block={block} />
          ))}

          <aside className="article__cta">
            <div className="article__cta-copy">
              <p className="article__cta-title">Fale com um especialista</p>
              <p>Entre em contato e solicite um orçamento.</p>
            </div>
            <Link to={{ pathname: '/', hash: '#contato' }} className="button article__cta-button">
              Entrar em contato
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </aside>
        </div>
      </div>

      {others.length > 0 && (
        <section className="article__more" data-theme="light" aria-labelledby="mais-artigos">
          <div className="container">
            <h2 className="article__more-title" id="mais-artigos">
              Outros artigos
            </h2>
            <div className="blog-list__grid">
              {others.map((p) => (
                <PostCard key={p.slug} post={p} headingLevel="h3" />
              ))}
            </div>
          </div>
        </section>
      )}
    </article>
  );
}
