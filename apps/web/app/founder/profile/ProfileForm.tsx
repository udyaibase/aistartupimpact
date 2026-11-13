'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { User, Mail, Building2, Briefcase, Phone, Globe, Linkedin, Twitter, Save, Loader2, Upload, Camera, Plus, Trash2, Users } from 'lucide-react';

interface ProfileFormProps {
  founder: {
    id: string;
    name: string;
    email: string;
    company: string | null;
    companyDomain: string | null;
    role: string | null;
    phone: string | null;
    avatar: string | null;
    bio: string | null;
    linkedin: string | null;
    twitter: string | null;
    website: string | null;
    authProvider: string;
    emailVerified: boolean;
    status: string;
    createdAt: string;
  };
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  bio: string;
  avatar: string;
  linkedin: string;
  twitter: string;
  website: string;
}

export default function ProfileForm({ founder }: ProfileFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(founder.avatar);
  
  // Team members state
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [showAddMember, setShowAddMember] = useState(false);
  
  const [formData, setFormData] = useState({
    name: founder.name || '',
    company: founder.company || '',
    role: founder.role || '',
    phone: founder.phone || '',
    bio: founder.bio || '',
    linkedin: founder.linkedin || '',
    twitter: founder.twitter || '',
    website: founder.website || '',
    avatar: founder.avatar || '',
  });

  const bioCharLimit = 1000;
  const bioCharsRemaining = bioCharLimit - (formData.bio?.length || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/founder/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: 'Profile updated successfully!' });
        router.refresh();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update profile' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An error occurred. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    // Enforce bio character limit
    if (name === 'bio' && value.length > bioCharLimit) {
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setUploadMessage({ type: 'error', text: 'Please upload an image file' });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setUploadMessage({ type: 'error', text: 'Image size must be less than 5MB' });
      return;
    }

    setUploadingImage(true);
    setUploadMessage(null);

    try {
      // Create form data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'founder-avatar');

      // Upload to your image upload endpoint
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok && data.url) {
        setAvatarPreview(data.url);
        setFormData(prev => ({ ...prev, avatar: data.url }));
        setUploadMessage({ type: 'success', text: 'Image uploaded successfully!' });
        // Clear success message after 3 seconds
        setTimeout(() => setUploadMessage(null), 3000);
      } else {
        setUploadMessage({ type: 'error', text: data.error || 'Failed to upload image' });
      }
    } catch (error) {
      setUploadMessage({ type: 'error', text: 'Failed to upload image. Please try again.' });
    } finally {
      setUploadingImage(false);
    }
  };

  // Team member functions
  const addTeamMember = () => {
    const newMember: TeamMember = {
      id: `temp-${Date.now()}`,
      name: '',
      role: '',
      bio: '',
      avatar: '',
      linkedin: '',
      twitter: '',
      website: '',
    };
    setTeamMembers([...teamMembers, newMember]);
    setShowAddMember(false);
  };

  const updateTeamMember = (id: string, field: keyof TeamMember, value: string) => {
    setTeamMembers(teamMembers.map(member => 
      member.id === id ? { ...member, [field]: value } : member
    ));
  };

  const removeTeamMember = (id: string) => {
    setTeamMembers(teamMembers.filter(member => member.id !== id));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Profile Image Upload */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="portal-section-title mb-6">
          Profile Picture
        </h2>
        
        <div className="flex items-center gap-6">
          {/* Avatar Preview */}
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-brand to-brand/80 flex items-center justify-center text-white text-2xl font-bold overflow-hidden">
              {avatarPreview ? (
                <Image src={avatarPreview} alt="Profile" width={96} height={96} unoptimized className="w-full h-full object-cover" />
              ) : (
                <span>{formData.name.charAt(0).toUpperCase()}</span>
              )}
            </div>
            {uploadingImage && (
              <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              </div>
            )}
          </div>

          {/* Upload Button and Messages */}
          <div className="flex-1">
            <label className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg cursor-pointer transition-colors">
              <Camera className="w-4 h-4" />
              <span className="text-sm font-medium">Upload Photo</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={uploadingImage}
                className="hidden"
              />
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              JPG, PNG or GIF. Max size 5MB.
            </p>
            
            {/* Upload-specific message */}
            {uploadMessage && (
              <div className={`mt-3 p-3 rounded-lg text-sm ${
                uploadMessage.type === 'success' 
                  ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200'
                  : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
              }`}>
                {uploadMessage.text}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Profile Info Card */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="portal-section-title mb-6">
          Personal Information
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Full Name *
              </div>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>

          {/* Email (Read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email Address
              </div>
            </label>
            <input
              type="email"
              value={founder.email}
              disabled
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-not-allowed"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Email cannot be changed
            </p>
          </div>

          {/* Company */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Company Name
              </div>
            </label>
            <input
              type="text"
              name="company"
              value={formData.company}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4" />
                Role / Title
              </div>
            </label>
            <input
              type="text"
              name="role"
              value={formData.role}
              onChange={handleChange}
              placeholder="e.g., CEO, Founder, CTO"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Phone Number
              </div>
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="+91 98765 43210"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>
        </div>

        {/* Bio */}
        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Bio
            <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
              ({bioCharsRemaining} characters remaining)
            </span>
          </label>
          <textarea
            name="bio"
            value={formData.bio}
            onChange={handleChange}
            rows={4}
            maxLength={bioCharLimit}
            placeholder="Tell us about yourself and your work... (max 1000 characters)"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
          />
          <div className="flex justify-between items-center mt-1">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              This will be shown on your public founder profile
            </p>
            <p className={`text-xs font-medium ${
              bioCharsRemaining < 100 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-500 dark:text-gray-400'
            }`}>
              {formData.bio.length} / {bioCharLimit}
            </p>
          </div>
        </div>
      </div>

      {/* Social Links Card */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="portal-section-title mb-6">
          Social Links
        </h2>

        <div className="space-y-4">
          {/* Website */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4" />
                Website
              </div>
            </label>
            <input
              type="url"
              name="website"
              value={formData.website}
              onChange={handleChange}
              placeholder="https://yourcompany.com"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>

          {/* LinkedIn */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <div className="flex items-center gap-2">
                <Linkedin className="w-4 h-4" />
                LinkedIn Profile
              </div>
            </label>
            <input
              type="url"
              name="linkedin"
              value={formData.linkedin}
              onChange={handleChange}
              placeholder="https://linkedin.com/in/yourprofile"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>

          {/* Twitter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <div className="flex items-center gap-2">
                <Twitter className="w-4 h-4" />
                Twitter / X Profile
              </div>
            </label>
            <input
              type="url"
              name="twitter"
              value={formData.twitter}
              onChange={handleChange}
              placeholder="https://twitter.com/yourhandle"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Account Info Card */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="portal-section-title mb-4">
          Account Information
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500 dark:text-gray-400">Account Status</p>
            <p className="text-gray-900 dark:text-white font-medium mt-1">
              {founder.status === 'ACTIVE' ? 'Active' : founder.status}
            </p>
          </div>
          <div>
            <p className="text-gray-500 dark:text-gray-400">Email Verified</p>
            <p className="text-gray-900 dark:text-white font-medium mt-1">
              {founder.emailVerified ? 'Verified' : 'Not verified'}
            </p>
          </div>
          <div>
            <p className="text-gray-500 dark:text-gray-400">Authentication Method</p>
            <p className="text-gray-900 dark:text-white font-medium mt-1 capitalize">
              {founder.authProvider}
            </p>
          </div>
          <div>
            <p className="text-gray-500 dark:text-gray-400">Member Since</p>
            <p className="text-gray-900 dark:text-white font-medium mt-1">
              {new Date(founder.createdAt).toLocaleDateString('en-IN', { 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Team Members / Additional Founder Profiles */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5" />
              Team Member Profiles
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Add profiles for co-founders and key team members. These will be displayed on your startup pages.
            </p>
          </div>
          <button
            type="button"
            onClick={addTeamMember}
            className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand/90 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Member
          </button>
        </div>

        {teamMembers.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
            <Users className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 font-jakarta text-sm mb-2">
              No team members added yet
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Add co-founders and team members to showcase your team
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {teamMembers.map((member, index) => (
              <div key={member.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-sora font-bold text-sm text-navy dark:text-white">
                    Team Member {index + 1}
                  </h3>
                  <button
                    type="button"
                    onClick={() => removeTeamMember(member.id)}
                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    aria-label="Remove team member"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      value={member.name}
                      onChange={(e) => updateTeamMember(member.id, 'name', e.target.value)}
                      placeholder="John Doe"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent text-sm"
                    />
                  </div>

                  {/* Role */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Role / Title *
                    </label>
                    <input
                      type="text"
                      value={member.role}
                      onChange={(e) => updateTeamMember(member.id, 'role', e.target.value)}
                      placeholder="Co-Founder & CTO"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent text-sm"
                    />
                  </div>
                </div>

                {/* Bio */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Bio (max 1000 characters)
                  </label>
                  <textarea
                    value={member.bio}
                    onChange={(e) => {
                      if (e.target.value.length <= 1000) {
                        updateTeamMember(member.id, 'bio', e.target.value);
                      }
                    }}
                    rows={3}
                    maxLength={1000}
                    placeholder="Brief bio about this team member..."
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent resize-none text-sm"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {member.bio.length} / 1000 characters
                  </p>
                </div>

                {/* Social Links */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      LinkedIn
                    </label>
                    <input
                      type="url"
                      value={member.linkedin}
                      onChange={(e) => updateTeamMember(member.id, 'linkedin', e.target.value)}
                      placeholder="https://linkedin.com/in/..."
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Twitter
                    </label>
                    <input
                      type="url"
                      value={member.twitter}
                      onChange={(e) => updateTeamMember(member.id, 'twitter', e.target.value)}
                      placeholder="https://twitter.com/..."
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Website
                    </label>
                    <input
                      type="url"
                      value={member.website}
                      onChange={(e) => updateTeamMember(member.id, 'website', e.target.value)}
                      placeholder="https://..."
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Message */}
      {message && (
        <div className={`rounded-lg p-4 ${
          message.type === 'success' 
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200'
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {/* Submit Button */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-6 py-3 bg-brand text-white rounded-lg hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              Save Changes
            </>
          )}
        </button>
      </div>
    </form>
  );
}
