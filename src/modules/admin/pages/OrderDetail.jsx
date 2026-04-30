import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import { 
  ArrowLeft, RefreshCcw, ExternalLink, CheckCircle2, 
  CreditCard, User as UserIcon, Calendar, Hash, Image as ImageIcon, Loader2
} from 'lucide-react';
import { fetchOrderDetail } from '../../../services/adminService';
import { toast } from 'react-hot-toast';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../utils/firebase';

const OrderDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation('admin');
  
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrder();
  }, [id]);

  const loadOrder = async () => {
    setLoading(true);
    try {
      const data = await fetchOrderDetail(id);
      setOrder(data);
    } catch (error) {
      console.error('Error loading order:', error);
      toast.error('Failed to load order details');
      navigate('/admin/orders');
    } finally {
      setLoading(false);
    }
  };

  const handleRefund = async () => {
    if (!window.confirm(t('orders.detail.confirmRefund'))) return;
    try {
      await updateDoc(doc(db, 'order', id), { status: 'Refunded' });
      toast.success(t('orders.detail.refundSuccess'));
      loadOrder(); // refresh data
    } catch (error) {
      console.error('Error refunding order:', error);
      toast.error(t('orders.detail.refundFailed'));
    }
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    const date = ts.toMillis ? new Date(ts.toMillis()) : new Date(ts);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const renderStatusBadge = (status) => {
    const s = (status || '').toLowerCase();
    switch(s) {
      case 'paid': return <Badge variant="success">{t('common.paid')}</Badge>;
      case 'pending': return <Badge variant="warning">{t('common.pending')}</Badge>;
      case 'failed': return <Badge variant="danger">{t('common.failed')}</Badge>;
      case 'refunded': return <Badge variant="neutral" className="bg-gray-500/20 text-gray-400 border-gray-500/30">{t('common.refunded')}</Badge>;
      default: return <Badge variant="neutral">{status}</Badge>;
    }
  };

  if (loading || !order) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
        <Loader2 size={48} className="animate-spin text-primary mb-4 opacity-50" />
        <p className="text-gray-400 font-medium">{t('common.loading')}...</p>
      </div>
    );
  }

  const orderId = order.order_sequence_id || `#${order.id.substring(0,8).toUpperCase()}`;
  const tickets = order.ticketsList || [];
  const questionAnswer = order.question_answer || {};

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
            <h1 className="text-3xl font-serif font-bold text-white">{orderId}</h1>
            {renderStatusBadge(order.status)}
          </div>
          <p className="text-gray-400 text-sm mt-1 flex items-center gap-2">
            <Calendar size={14} /> {formatDate(order.created_at)}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {(order.status || '').toLowerCase() === 'paid' && (
            <Button variant="outline" className="flex items-center gap-2 text-gray-300 hover:text-white border-white/10" onClick={handleRefund}>
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
                    <p className="font-medium text-white">{order.competition_title || 'Unknown Competition'}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate(`/admin/competitions/${order.competition_id}`)}>
                  {t('common.view')}
                </Button>
              </div>

              {/* Tickets */}
              <div className="mb-8">
                <p className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                  <Hash size={16} /> {t('orders.detail.ticketNumbers')} ({order.total_ticket || 0})
                </p>
                <div className="flex flex-wrap gap-2">
                  {tickets.length > 0 ? tickets.map(tk => (
                    <span key={tk.id} className="px-3 py-1.5 bg-[#121212] border border-white/10 text-primary font-mono text-sm rounded-md shadow-sm">
                      {tk.ticket_sequence}
                    </span>
                  )) : (
                    <span className="text-gray-500 italic text-sm">No tickets found</span>
                  )}
                </div>
              </div>

              {/* Skill Question */}
              {questionAnswer.question && (
                <div className="mb-8 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col sm:flex-row items-start gap-3">
                  <CheckCircle2 className="text-emerald-500 mt-0.5 shrink-0" size={18} />
                  <div className="w-full">
                    <p className="text-sm font-medium text-emerald-400">{t('orders.detail.skillQuestion')}</p>
                    <p className="text-xs text-emerald-500/70 mt-1 mb-2">{questionAnswer.question}</p>
                    <div className="bg-[#121212] border border-emerald-500/10 p-2 rounded text-xs text-emerald-400 font-mono">
                      Answered: {questionAnswer.correct_answer}
                    </div>
                  </div>
                </div>
              )}

              {/* Pricing */}
              <div className="space-y-4">
                <div className="flex justify-between text-sm text-gray-400">
                  <span>{t('orders.detail.pricePerTicket')}</span>
                  <span>£{((order.total_amount || 0) / (order.total_ticket || 1)).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-400">
                  <span>{t('orders.detail.quantity')}</span>
                  <span>x {order.total_ticket || 0}</span>
                </div>
                <div className="flex justify-between text-sm text-white pt-2 border-t border-white/10">
                  <span>{t('orders.detail.subtotal')}</span>
                  <span>£{(order.subtotal || order.total_amount || 0).toFixed(2)}</span>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-400">
                    <span>{t('orders.detail.discount')}</span>
                    <span>-£{order.discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="mt-6 p-4 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-between">
                  <span className="text-lg font-bold text-white">{t('orders.detail.total')}</span>
                  <span className="text-2xl font-bold text-primary">£{(order.total_amount || 0).toFixed(2)}</span>
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
                <Button variant="outline" size="sm" onClick={() => navigate(`/admin/users/${order.user_ref}`)}>
                  {t('orders.detail.viewProfile')}
                </Button>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/5">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                    {(order.user_name || '?').charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-white">{order.user_name || 'Unknown User'}</p>
                    <p className="text-xs text-gray-400">{order.user_email || 'No email'}</p>
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
                    Stripe
                  </div>
                  <div>
                    <p className="text-sm text-white">{t('orders.detail.endingIn')} ****</p>
                    <p className="text-xs text-gray-500">{formatDate(order.paid_at || order.created_at)}</p>
                  </div>
                </div>
                <div className="pt-4 border-t border-white/10">
                  <p className="text-xs text-gray-500 mb-1">{t('orders.detail.gatewayId')}</p>
                  <div className="flex items-center justify-between p-2.5 bg-[#121212] border border-white/10 rounded-lg">
                    <span className="text-xs font-mono text-gray-400 truncate">pi_{order.id.substring(0,10)}...</span>
                    <button className="cursor-pointer text-primary hover:text-white transition-colors">
                      <ExternalLink size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default OrderDetail;
