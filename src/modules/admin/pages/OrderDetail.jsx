import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import { 
  ArrowLeft, RefreshCcw, ExternalLink, CheckCircle2, 
  CreditCard, User as UserIcon, Calendar, Hash, Image as ImageIcon
} from 'lucide-react';

const OrderDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation('admin');

  const order = {
    id: id || "ORD-1023",
    date: "12 May 2026, 14:30",
    status: "Paid",
    competition: { id: "1", name: t('competitionNames.iphone') },
    tickets: ["#042", "#043", "#044", "#045", "#046"],
    pricing: { pricePerTicket: 2.99, quantity: 5, subtotal: 14.95, discount: 0.00, total: 14.95 },
    skillQuestion: { answered: true, correct: true },
    user: { id: "1", name: "John Doe", email: "john@example.com", phone: "+44 7700 900123" },
    payment: { method: "Visa", last4: "4242", gatewayId: "pi_3M2K...", date: "12 May 2026, 14:30" },
    refund: null
  };

  const renderStatusBadge = (status) => {
    switch(status) {
      case 'Paid': return <Badge variant="success">{t('common.paid')}</Badge>;
      case 'Pending': return <Badge variant="warning">{t('common.pending')}</Badge>;
      case 'Failed': return <Badge variant="danger">{t('common.failed')}</Badge>;
      case 'Refunded': return <Badge variant="neutral" className="bg-gray-500/20 text-gray-400 border-gray-500/30">{t('common.refunded')}</Badge>;
      default: return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 fade-in pb-20">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <button 
            onClick={() => navigate('/admin/orders')}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm mb-3"
          >
            <ArrowLeft size={16} />
            {t('orders.detail.backToOrders')}
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-serif font-bold text-white">{order.id}</h1>
            {renderStatusBadge(order.status)}
          </div>
          <p className="text-gray-400 text-sm mt-1 flex items-center gap-2">
            <Calendar size={14} /> {order.date}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {order.status !== 'Refunded' && (
            <Button variant="outline" className="flex items-center gap-2 text-gray-300 hover:text-white border-white/10">
              <RefreshCcw size={16} />
              {t('orders.detail.refundOrder')}
            </Button>
          )}
        </div>
      </div>

      {/* Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 pt-2">
        
        {/* LEFT: Order Details */}
        <div className="lg:col-span-3 space-y-6">
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-bold text-white mb-6">{t('orders.detail.orderDetails')}</h2>
              
              {/* Competition */}
              <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center">
                    <ImageIcon className="text-gray-500" size={24} />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">{t('orders.detail.competition')}</p>
                    <p className="font-medium text-white">{order.competition.name}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate(`/admin/competitions/${order.competition.id}`)}>
                  {t('common.view')}
                </Button>
              </div>

              {/* Tickets */}
              <div className="mb-8">
                <p className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                  <Hash size={16} /> {t('orders.detail.ticketNumbers')} ({order.tickets.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {order.tickets.map(tk => (
                    <span key={tk} className="px-3 py-1.5 bg-[#121212] border border-white/10 text-primary font-mono text-sm rounded-md shadow-sm">
                      {tk}
                    </span>
                  ))}
                </div>
              </div>

              {/* Skill Question */}
              <div className="mb-8 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3">
                <CheckCircle2 className="text-emerald-500 mt-0.5 shrink-0" size={18} />
                <div>
                  <p className="text-sm font-medium text-emerald-400">{t('orders.detail.skillQuestion')}</p>
                  <p className="text-xs text-emerald-500/70 mt-1">{t('orders.detail.skillQuestionDesc')}</p>
                </div>
              </div>

              {/* Pricing */}
              <div className="space-y-4">
                <div className="flex justify-between text-sm text-gray-400">
                  <span>{t('orders.detail.pricePerTicket')}</span>
                  <span>£{order.pricing.pricePerTicket.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-400">
                  <span>{t('orders.detail.quantity')}</span>
                  <span>x {order.pricing.quantity}</span>
                </div>
                <div className="flex justify-between text-sm text-white pt-2 border-t border-white/10">
                  <span>{t('orders.detail.subtotal')}</span>
                  <span>£{order.pricing.subtotal.toFixed(2)}</span>
                </div>
                {order.pricing.discount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-400">
                    <span>{t('orders.detail.discount')}</span>
                    <span>-£{order.pricing.discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="mt-6 p-4 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-between">
                  <span className="text-lg font-bold text-white">{t('orders.detail.total')}</span>
                  <span className="text-2xl font-bold text-primary">£{order.pricing.total.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: User & Payment */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* User Info */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <UserIcon size={18} className="text-primary" />
                  {t('orders.detail.customerInfo')}
                </h2>
                <Button variant="outline" size="sm" onClick={() => navigate(`/admin/users/${order.user.id}`)}>
                  {t('orders.detail.viewProfile')}
                </Button>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/5">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                    {order.user.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-white">{order.user.name}</p>
                    <p className="text-xs text-gray-400">{order.user.email}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">{t('common.email')}</p>
                    <p className="text-sm text-white truncate">{order.user.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{t('common.phone')}</p>
                    <p className="text-sm text-white">{order.user.phone}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Info */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                <CreditCard size={18} className="text-primary" />
                {t('orders.detail.paymentGateway')}
              </h2>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-8 rounded bg-white flex items-center justify-center text-[#1434CB] font-bold italic shadow-sm">
                    {order.payment.method}
                  </div>
                  <div>
                    <p className="text-sm text-white">{t('orders.detail.endingIn')} {order.payment.last4}</p>
                    <p className="text-xs text-gray-500">{order.payment.date}</p>
                  </div>
                </div>
                <div className="pt-4 border-t border-white/10">
                  <p className="text-xs text-gray-500 mb-1">{t('orders.detail.gatewayId')}</p>
                  <div className="flex items-center justify-between p-2.5 bg-[#121212] border border-white/10 rounded-lg">
                    <span className="text-xs font-mono text-gray-400 truncate">{order.payment.gatewayId}</span>
                    <button className="cursor-pointer text-primary hover:text-white transition-colors">
                      <ExternalLink size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Refund (conditional) */}
          {order.refund && (
            <Card className="border-red-500/20 bg-red-500/5">
              <CardContent className="p-6">
                <h2 className="text-lg font-bold text-red-400 flex items-center gap-2 mb-4">
                  <RefreshCcw size={18} />
                  {t('orders.detail.refundIssued')}
                </h2>
                <div className="space-y-2">
                  <p className="text-sm text-white"><strong>{t('orders.detail.refundAmount')}:</strong> £{order.refund.amount.toFixed(2)}</p>
                  <p className="text-sm text-white"><strong>{t('orders.detail.refundDate')}:</strong> {order.refund.date}</p>
                  <p className="text-sm text-white"><strong>{t('orders.detail.refundReason')}:</strong> {order.refund.reason}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderDetail;
