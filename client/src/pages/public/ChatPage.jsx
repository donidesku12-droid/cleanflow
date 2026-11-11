import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { ChatPanel } from '../../components/ChatWidget.jsx';
import { ErrorState, PageLoader } from '../../components/ui.jsx';

/** Standalone, full-page chat (e.g. to link from a website or social profile). */
export default function ChatPage() {
  const { slug } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api.get(`/public/company/${slug}`).then(setInfo).catch(setError); }, [slug]);
  if (error) return <ErrorState error={error} />;
  if (!info) return <PageLoader />;
  if (!info.assistant) return <ErrorState error={{ message: `${info.company.name} does not offer chat support at the moment.` }} />;
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-50 sm:p-6">
      <ChatPanel slug={slug} assistantName={info.assistant.name} welcome={info.assistant.welcome}
        onBook={() => { window.location.href = `/book/${slug}`; }}
        className="h-screen w-full shadow-soft sm:h-[680px] sm:max-w-md sm:rounded-2xl sm:border sm:border-navy-100" />
    </div>
  );
}
