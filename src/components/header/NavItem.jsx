import { Link } from 'react-router-dom';

/** A navigation entry: either a section of the home page or a separate route. */
export default function NavItem({ item, className, children, onNavigate, ...rest }) {
  const to = item.route ?? { pathname: '/', hash: `#${item.section}` };
  return (
    <Link to={to} className={className} onClick={onNavigate} {...rest}>
      {children ?? item.label}
    </Link>
  );
}
