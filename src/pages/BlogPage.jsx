import PostCard from '../components/blog/PostCard';
import Reveal from '../components/ui/Reveal';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { usePosts } from '../i18n/posts';
import { useStrings } from '../i18n/strings';
import './Blog.css';

export default function BlogPage() {
  const posts = usePosts();
  const t = useStrings();
  const sorted = [...posts].sort((a, b) => b.date.localeCompare(a.date));
  useDocumentTitle('Blog');

  return (
    <div className="blog-page">
      <header className="blog-hero" data-theme="dark">
        <div className="container">
          <p className="eyebrow eyebrow--dark">
            <span className="eyebrow__index">{String(posts.length).padStart(2, '0')}</span>
            Blog
          </p>
          <h1 className="blog-hero__title">{t.blog.title}</h1>
        </div>
      </header>

      <section className="blog-list" data-theme="light" aria-label={t.blog.articles}>
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
