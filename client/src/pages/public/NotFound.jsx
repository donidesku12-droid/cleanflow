import { Button } from '../../components/ui.jsx';
import Logo from '../../components/Logo.jsx';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Logo />
      <p className="mt-10 text-6xl font-extrabold text-emerald-500">404</p>
      <h1 className="mt-3 text-2xl font-bold">Deze pagina bestaat niet</h1>
      <p className="mt-2 text-navy-500">De link werkt misschien niet meer, of de pagina is verplaatst.</p>
      <div className="mt-8 flex gap-3"><Button to="/">Naar de homepage</Button><Button variant="secondary" to="/app">Naar dashboard</Button></div>
    </div>
  );
}
