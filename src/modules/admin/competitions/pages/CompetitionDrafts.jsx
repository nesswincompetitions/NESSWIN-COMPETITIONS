import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteCompetition } from '@/modules/admin/competitions/services/adminCompetitionService';
import { Card, CardContent } from '@/shared/components/ui/Card';
import Button from '@/shared/components/ui/Button';
import Badge from '@/shared/components/ui/Badge';
import Modal from '@/shared/components/ui/Modal';
import { ArrowLeft, FileEdit, Trash2, Plus, Clock, ImageIcon, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useCompetitionDraftsFeed } from '@/shared/hooks/useAdminData';

const CompetitionDrafts = () => {
  const navigate = useNavigate();
  const [deleteModal, setDeleteModal] = useState({ open: false, draft: null });
  const [deleting, setDeleting] = useState(false);
  const { data: drafts, loading } = useCompetitionDraftsFeed();

  const handleDelete = async () => {
    if (!deleteModal.draft) return;
    setDeleting(true);
    try {
      await deleteCompetition(deleteModal.draft.id);
      
      toast.success('Draft deleted.');
      setDeleteModal({ open: false, draft: null });
    } catch (err) {
      console.error('Failed to delete draft:', err);
      toast.error('Failed to delete draft.');
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="max-w-7xl mx-auto pb-20 space-y-6 fade-in">
      {/* Header */}
      <header>
        <button
          onClick={() => navigate('/admin/competitions')}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm mb-4 w-fit"
        >
          <ArrowLeft size={16} />
          Back to Competitions
        </button>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold">Draft Competitions</h1>
            <p className="text-gray-400 mt-1">Resume where you left off — all unsaved drafts are stored here.</p>
          </div>
          <Button variant="primary" className="flex items-center gap-2 shrink-0" onClick={() => navigate('/admin/competitions/create')}>
            <Plus size={18} />
            Create New
          </Button>
        </div>
      </header>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      ) : drafts.length === 0 ? (
        <Card>
          <CardContent className="py-20 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
              <FileEdit size={28} className="text-gray-500" />
            </div>
            <div>
              <p className="text-lg font-semibold text-white">No drafts yet</p>
              <p className="text-sm text-gray-400 mt-1">When you save a competition as a draft, it will appear here so you can resume it later.</p>
            </div>
            <Button variant="primary" onClick={() => navigate('/admin/competitions/create')}>
              <Plus size={16} className="mr-2" /> Create Competition
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {drafts.map(draft => (
            <Card key={draft.id} className="flex flex-col group hover:border-primary/30 transition-colors">
              {/* Image */}
              <div className="aspect-video bg-white/5 rounded-t-xl overflow-hidden flex items-center justify-center border-b border-white/5 relative">
                {draft.image && draft.image.length > 0 ? (
                  <img src={draft.image[0]} alt={draft.title} className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon size={32} className="text-white/10" />
                )}
                <div className="absolute top-3 left-3">
                  <Badge variant="warning">Draft</Badge>
                </div>
              </div>

              <CardContent className="p-4 flex flex-col gap-3 flex-1">
                <div className="flex-1">
                  <p className="font-semibold text-white line-clamp-1">{draft.title || 'Untitled Draft'}</p>
                  {(draft.tag || draft.sub_title) && (
                    <p className="text-sm text-gray-400 mt-0.5 line-clamp-2">{draft.tag || draft.sub_title}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                  <div>
                    <span className="block text-gray-600">Category</span>
                    <span className="text-gray-300">{draft.category || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-gray-600">Ticket Price</span>
                    <span className="text-gray-300">{draft.ticket_price ? `£${draft.ticket_price}` : '—'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-gray-500 pt-1 border-t border-white/5">
                  <Clock size={12} />
                  <span>Last saved: {formatDate(draft.updated_at)}</span>
                </div>

                <div className="flex gap-2 mt-1">
                  <Button
                    variant="primary"
                    size="sm"
                    className="flex-1 flex items-center justify-center gap-2"
                    onClick={() => navigate(`/admin/competitions/create?id=${draft.id}`)}
                  >
                    <FileEdit size={14} /> Resume Draft
                  </Button>
                  <button
                    onClick={() => setDeleteModal({ open: true, draft })}
                    className="cursor-pointer p-2 hover:bg-red-500/10 rounded-lg text-gray-500 hover:text-red-400 transition-colors border border-white/10"
                    title="Delete draft"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, draft: null })}
        title="Delete Draft"
        description="This action cannot be undone. The draft and all its data will be permanently deleted."
        actions={
          <>
            <Button variant="outline" onClick={() => setDeleteModal({ open: false, draft: null })}>Cancel</Button>
            <Button
              variant="primary"
              className="bg-red-500 border-red-500 hover:bg-red-600 text-white"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
              Delete Draft
            </Button>
          </>
        }
      >
        {deleteModal.draft && (
          <div className="p-4 bg-white/5 rounded-xl border border-white/10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <AlertCircle size={18} className="text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">{deleteModal.draft.title || 'Untitled Draft'}</p>
              <p className="text-xs text-gray-500">ID: #{deleteModal.draft.id}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default CompetitionDrafts;
