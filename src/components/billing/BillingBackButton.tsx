import { ChevronLeft } from 'lucide-react';
import './billing.css';

export function BillingBackButton({ onBack }: { onBack: () => void }) {
  return <div className="billing-design billing-back-row"><button type="button" className="billing-back" onClick={onBack}>
    <ChevronLeft aria-hidden size={20} /><span>Voltar</span>
  </button></div>;
}
