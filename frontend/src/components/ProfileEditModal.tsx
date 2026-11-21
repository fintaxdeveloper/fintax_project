import React, { useState, useRef } from 'react';
import { X, Camera, User as UserIcon, Phone, MapPin, Save, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { Language } from '../translations';

interface ProfileEditModalProps {
  lang: Language;
  onClose: () => void;
}

const ORIGIN_PREFIX =
  typeof window !== 'undefined' &&
  window.location.hostname !== 'localhost' &&
  window.location.hostname !== '127.0.0.1'
    ? ''
    : 'http://127.0.0.1:5000';

export const resolveAvatarUrl = (raw?: string): string | null => {
  if (!raw || !raw.trim()) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) {
    return raw;
  }
  return `${ORIGIN_PREFIX}${raw.startsWith('/') ? raw : `/${raw}`}`;
};

export const ProfileEditModal: React.FC<ProfileEditModalProps> = ({ lang, onClose }) => {
  const { user, updateProfile, uploadAvatar } = useAuth();
  const isDe = lang === 'de';

  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [city, setCity] = useState(user?.city || '');
  const [previewUrl, setPreviewUrl] = useState<string | null>(resolveAvatarUrl(user?.profile_image));
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(isDe ? 'Bitte wählen Sie eine Bilddatei (JPG/PNG).' : 'Please select an image file (JPG/PNG).');
      return;
    }
    setError(null);
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(isDe ? 'Name darf nicht leer sein.' : 'Name is required.');
      return;
    }

    setSaving(true);
    setError(null);

    if (selectedFile) {
      const avRes = await uploadAvatar(selectedFile);
      if (!avRes.success) {
        setSaving(false);
        setError(avRes.error || (isDe ? 'Profilbild-Upload fehlgeschlagen.' : 'Avatar upload failed.'));
        return;
      }
    }

    const res = await updateProfile({
      name: name.trim(),
      phone: phone.trim(),
      city: city.trim(),
    });

    setSaving(false);
    if (!res.success) {
      setError(res.error || (isDe ? 'Speichern fehlgeschlagen.' : 'Failed to save profile.'));
      return;
    }

    setSavedOk(true);
    setTimeout(() => onClose(), 750);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        className="modal-content"
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '460px',
          boxShadow: '0 25px 60px -12px rgba(15, 23, 42, 0.3)',
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)',
            color: '#ffffff',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
              {isDe ? 'Profil bearbeiten' : 'Edit Profile'}
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.75rem', opacity: 0.85 }}>
              {user.email} {user.clientNumber ? `• #${user.clientNumber}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              borderRadius: '50%',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Avatar Upload Picker */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                position: 'relative',
                width: 92,
                height: 92,
                borderRadius: '50%',
                cursor: 'pointer',
                background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
                padding: '3px',
                boxShadow: '0 8px 20px rgba(37, 99, 235, 0.25)',
              }}
              title={isDe ? 'Profilbild ändern' : 'Change profile photo'}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  overflow: 'hidden',
                  background: '#eff6ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2rem',
                  fontWeight: 800,
                  color: '#1d4ed8',
                }}
              >
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Profile"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  (name || user.name || 'U').charAt(0).toUpperCase()
                )}
              </div>
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: '#0f172a',
                  color: '#ffffff',
                  border: '2px solid #ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Camera size={14} />
              </div>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: 'none',
                border: 'none',
                color: '#2563eb',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {isDe ? 'Profilbild hochladen / ändern' : 'Upload / Change Photo'}
            </button>
          </div>

          {error && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                padding: '0.65rem 0.85rem',
                borderRadius: '10px',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}

          {savedOk && (
            <div
              style={{
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                color: '#047857',
                padding: '0.65rem 0.85rem',
                borderRadius: '10px',
                fontSize: '0.8rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <CheckCircle2 size={16} />
              {isDe ? 'Profil erfolgreich gespeichert!' : 'Profile saved successfully!'}
            </div>
          )}

          {/* Full Name */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: 5 }}>
              <UserIcon size={14} />
              {isDe ? 'Vollständiger Name' : 'Full Name'}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isDe ? 'z.B. Max Mustermann' : 'e.g. Max Mustermann'}
              required
              style={{ width: '100%' }}
            />
          </div>

          {/* Phone Number */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: 5 }}>
              <Phone size={14} />
              {isDe ? 'Telefonnummer' : 'Phone Number'}
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+49 170 1234567"
              style={{ width: '100%' }}
            />
          </div>

          {/* City */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: 5 }}>
              <MapPin size={14} />
              {isDe ? 'Stadt' : 'City'}
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder={isDe ? 'z.B. Frankfurt am Main' : 'e.g. Frankfurt am Main'}
              style={{ width: '100%' }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="btn btn-secondary"
              style={{ flex: 1 }}
            >
              {isDe ? 'Abbrechen' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary"
              style={{ flex: 1.4 }}
            >
              <Save size={15} />
              {saving ? (isDe ? 'Speichern...' : 'Saving...') : (isDe ? 'Speichern' : 'Save Changes')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
