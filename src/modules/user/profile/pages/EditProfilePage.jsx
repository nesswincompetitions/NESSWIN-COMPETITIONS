import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/shared/state/AuthContext';
import {
  reauthenticate,
  saveEditedProfile,
  updateProfile,
} from '@/modules/user/profile/services/profileService';
import { uploadImages } from '@/shared/services/storageService';
import { toast } from 'react-hot-toast';
import {
  ArrowLeft,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  Camera,
  Save,
  KeyRound,
} from 'lucide-react';

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
          className="flex-1 bg-transparent text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]/50 outline-none"
        />
        {rightSlot}
      </div>
    </div>
  );
}

export default function EditProfilePage() {
  const { currentUser, userData } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = React.useRef(null);

  const [displayName, setDisplayName] = useState(userData?.display_name ?? '');
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const needsReauth = newEmail || newPassword;

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file.'); return; }
    setUploading(true);
    try {
      const [url] = await uploadImages([file], 'users');
      await updateProfile(currentUser.uid, { photo_url: url });
      toast.success('Profile picture updated!');
    } catch {
      toast.error('Failed to upload image.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!currentUser?.uid) return;

    if (needsReauth && !currentPassword) {
      toast.error('Enter your current password to change email or password.');
      return;
    }

    setSaving(true);
    try {
      if (needsReauth) {
        await reauthenticate(currentPassword);
      }
      await saveEditedProfile(currentUser.uid, { displayName, newEmail, newPassword });
      toast.success('Profile updated!');
      setCurrentPassword('');
      setNewPassword('');
      setNewEmail('');
    } catch (err) {
      toast.error(err.message ?? 'Failed to update profile.');
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
          <ArrowLeft className="w-4 h-4" /> Back to Profile
        </button>

        <div className="mb-8">
          <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-[var(--color-primary)] mb-1">Account</p>
          <h1 className="text-3xl font-bold text-[var(--color-foreground)]">Edit Profile</h1>
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
                <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin" />
              </div>
            ) : userData?.photo_url ? (
              <>
                <img src={userData.photo_url} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-6 h-6 text-white mb-1" />
                  <span className="text-[10px] text-white font-medium uppercase tracking-wider">Change</span>
                </div>
              </>
            ) : (
              <>
                <div className="w-full h-full flex items-center justify-center bg-[var(--color-primary)]/15 text-2xl font-bold text-[var(--color-primary)]">
                  {getInitials()}
                </div>
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-6 h-6 text-white mb-1" />
                  <span className="text-[10px] text-white font-medium uppercase tracking-wider">Upload</span>
                </div>
              </>
            )}
          </button>
          <input type="file" ref={fileInputRef} onChange={handlePhotoUpload} accept="image/*" className="hidden" />
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Basic Info */}
          <div className="rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] p-6 space-y-4">
            <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-[var(--color-muted-foreground)]">Basic Info</h2>
            <Field
              label="Display Name"
              id="edit-display-name"
              placeholder="Your full name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          {/* Security */}
          <div className="rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] p-6 space-y-4">
            <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-[var(--color-muted-foreground)]">Security</h2>

            <Field
              label="New Email (optional)"
              id="edit-email"
              type="email"
              placeholder={currentUser?.email}
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />

            <Field
              label="New Password (optional)"
              id="edit-new-password"
              type={showNew ? 'text' : 'password'}
              placeholder="Leave blank to keep current"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              rightSlot={
                <button type="button" onClick={() => setShowNew((v) => !v)} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors cursor-pointer">
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />

            {needsReauth && (
              <div className="rounded-xl bg-yellow-500/5 border border-yellow-500/20 p-4 space-y-3">
                <div className="flex items-center gap-2 text-yellow-400 text-xs font-semibold">
                  <KeyRound className="w-3.5 h-3.5" />
                  Confirm your current password to continue
                </div>
                <Field
                  label="Current Password"
                  id="edit-current-password"
                  type={showCurrent ? 'text' : 'password'}
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  rightSlot={
                    <button type="button" onClick={() => setShowCurrent((v) => !v)} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors cursor-pointer">
                      {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full h-12 rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-sm font-semibold tracking-wide flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50 cursor-pointer shadow-[0_0_20px_oklch(0.78_0.14_78/0.2)]"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
