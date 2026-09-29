import PostCard from '../components/blog/PostCard';
import Reveal from '../components/ui/Reveal';
import { POSTS } from '../data/posts';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import './Blog.css';

const sorted = [...POSTS].sort((a, b) => b.date.localeCompare(a.date));

export default function BlogPage() {
  useDocumentTitle('Blog');

  return (
    <div className="blog-page">
      <header className="blog-hero" data-theme="dark">
        <div className="container">
          <p className="eyebrow eyebrow--dark">
            <span className="eyebrow__index">{String(POSTS.length).padStart(2, '0')}</span>
            Blog
          </p>
          <h1 className="blog-hero__title">Artigos e Notícias da LWN Engenharia</h1>
        </div>
      </header>

      <section className="blog-list" data-theme="light" aria-label="Artigos">
        <div className="container blog-list__grid">
          {sorted.map((post, i) => (
            <Reveal key={post.slug} delay={i * 0.08}>
              <PostCard post={post} />
            </Reveal>
          ))}
        </div>
      </section>
    </div>
  );
}
