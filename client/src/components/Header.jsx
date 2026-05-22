import './Header.css';

export default function Header() {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="logo-area">
          <img src="/logo.png" alt="Freight Flex LLC" className="logo-img" />
        </div>
        <nav className="header-nav">
          <a href="tel:+19037015996" className="nav-link">&#128222; (903) 701-5996</a>
        </nav>
      </div>
    </header>
  );
}
