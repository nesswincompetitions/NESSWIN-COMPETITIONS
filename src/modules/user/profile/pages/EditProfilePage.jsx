import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/shared/state/AuthContext';
import { useUserData } from '@/contexts/UserContext';
import {
  saveEditedProfile,
  updateProfile,
} from '@/modules/user/profile/services/profileService';
import { uploadImages } from '@/shared/services/storageService';
import { toast } from 'react-hot-toast';
import {
  ArrowLeft,
  User,
  Camera,
  Save,
} from 'lucide-react';
import LoadingSpinner from '@/shared/components/ui/LoadingSpinner';
import { useTranslation } from 'react-i18next';

function Field({ label, id, type = 'text', placeholder, value, onChange, rightSlot }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-semibold tracking-[0.12em] uppercase text-[var(--color-muted-foreground)]">
        {label}
      </label>
      <div className="flex items-center gap-3 px-4 h-12 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/20 focus-within:border-[var(--color-primary)]/60 transition-all">
        <input
          id={id}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          className="flex-1 bg-transparent text-sm text-(--color-foreground) placeholder:text-[var(--color-muted-foreground)]/50 outline-none"
        />
        {rightSlot}
      </div>
    </div>
  );
}

export default function EditProfilePage() {
  const { currentUser } = useAuth();
  const { userData } = useUserData();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const fileInputRef = React.useRef(null);

  const [displayName, setDisplayName] = useState(userData?.display_name ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error(t('profile.support.widget.invalidImage', 'Please select an image file.'));
      return;
    }
    setUploading(true);
    try {
      const [url] = await uploadImages([file], 'users');
      await updateProfile(currentUser.uid, { photo_url: url });
      toast.success(t('profile.uploadSuccess', 'Profile picture updated!'));
    } catch {
      toast.error(t('profile.uploadError', 'Failed to upload image.'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!currentUser?.uid) return;

    setSaving(true);
    try {
      await saveEditedProfile(currentUser.uid, { displayName });
      toast.success(t('profile.updateSuccess', 'Updated successfully!'));
    } catch (err) {
      toast.error(t('profile.updateFailed', 'Unable to save changes. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const getInitials = () =>
    (userData?.display_name || currentUser?.email || 'U')
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  return (
    <div className="min-h-screen bg-[var(--color-background)] pt-24 pb-16 px-4">
      <div className="max-w-lg mx-auto">
        <button
          onClick={() => navigate('/profile')}
          className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors mb-6 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> {t('profile.backToProfile')}
        </button>

        <div className="mb-8">
          <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-[var(--color-primary)] mb-1">{t('profile.account', 'Account')}</p>
          <h1 className="text-3xl font-bold text-[var(--color-foreground)]">{t('profile.editProfile')}</h1>
        </div>

        {/* Avatar */}
        <div className="flex justify-center mb-8">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="relative w-24 h-24 rounded-full overflow-hidden border-4 border-[var(--color-primary)]/40 hover:border-[var(--color-primary)] transition-colors group cursor-pointer shadow-[0_4px_20px_rgba(0,0,0,0.25)]"
          >
            {uploading ? (
              <div className="w-full h-full bg-black/50 flex items-center justify-center">
                <LoadingSpinner fullScreen={false} size="w-8 h-8" message="" />
              </div>
            ) : userData?.photo_url ? (
              <>
                <img src={userData.photo_url} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-6 h-6 text-white mb-1" />
                  <span className="text-[10px] text-white font-medium uppercase tracking-wider">{t('profile.change')}</span>
                </div>
              </>
            ) : (
              <>
                <div className="w-full h-full flex items-center justify-center bg-[var(--color-primary)]/15 text-2xl font-bold text-[var(--color-primary)]">
                  {getInitials()}
                </div>
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-6 h-6 text-white mb-1" />
                  <span className="text-[10px] text-white font-medium uppercase tracking-wider">{t('profile.upload')}</span>
                </div>
              </>
            )}
          </button>
          <input type="file" ref={fileInputRef} onChange={handlePhotoUpload} accept="image/*" className="hidden" />
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Basic Info */}
          <div className="rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] p-6 space-y-4">
            <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-[var(--color-muted-foreground)]">{t('profile.basicInfo')}</h2>
            <Field
              label={t('profile.displayName')}
              id="edit-display-name"
              placeholder={t('profile.displayNamePlaceholder')}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>


          <button
            type="submit"
            disabled={saving}
            className="w-full h-12 rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-sm font-semibold tracking-wide flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50 cursor-pointer shadow-[0_0_20px_oklch(0.78_0.14_78/0.2)]"
          >
            {saving ? <LoadingSpinner fullScreen={false} size="w-4 h-4" message="" /> : <Save className="w-4 h-4" />}
            {saving ? t('profile.saving') : t('profile.saveChanges')}
          </button>
        </form>
      </div>
    </div>
  );
}
