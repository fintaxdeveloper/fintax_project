import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/l10n/translations.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/primary_action_button.dart';
import '../../../../services/api_service.dart';
import '../../../../services/auth_service.dart';
import '../../../authentication/models/user_model.dart';

class EditProfileScreen extends StatefulWidget {
  final UserModel user;
  const EditProfileScreen({super.key, required this.user});

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final ImagePicker _picker = ImagePicker();
  late final TextEditingController _nameCtrl;
  late final TextEditingController _phoneCtrl;
  late final TextEditingController _cityCtrl;

  Uint8List? _pickedBytes;
  String? _pickedFilename;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _nameCtrl = TextEditingController(text: widget.user.name);
    _phoneCtrl = TextEditingController(text: widget.user.phone ?? '');
    _cityCtrl = TextEditingController(text: widget.user.city ?? '');
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _cityCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickAvatar() async {
    final isDe = Tr.currentLang == 'de';
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.photo_camera_outlined, color: AppColors.primary),
                title: Text(isDe ? 'Foto aufnehmen' : 'Take Photo'),
                onTap: () => Navigator.pop(ctx, ImageSource.camera),
              ),
              ListTile(
                leading: const Icon(Icons.photo_library_outlined, color: AppColors.primary),
                title: Text(isDe ? 'Aus Galerie wählen' : 'Choose from Gallery'),
                onTap: () => Navigator.pop(ctx, ImageSource.gallery),
              ),
            ],
          ),
        ),
      ),
    );
    if (source == null) return;

    try {
      final img = await _picker.pickImage(source: source, imageQuality: 85, maxWidth: 800);
      if (img == null) return;
      final bytes = await img.readAsBytes();
      if (!mounted) return;
      setState(() {
        _pickedBytes = bytes;
        _pickedFilename = img.name;
      });
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Fehler: $e');
    }
  }

  Future<void> _save() async {
    final isDe = Tr.currentLang == 'de';
    final name = _nameCtrl.text.trim();
    if (name.isEmpty) {
      AppSnackbar.warning(context, isDe ? 'Name darf nicht leer sein.' : 'Name is required.');
      return;
    }

    setState(() => _saving = true);

    UserModel latest = widget.user;

    if (_pickedBytes != null && _pickedFilename != null) {
      final avRes = await ApiService.uploadProfileAvatar(
        filename: _pickedFilename!,
        bytes: _pickedBytes!,
      );
      if (!mounted) return;
      if (avRes['success'] != true) {
        setState(() => _saving = false);
        AppSnackbar.error(context, avRes['error']?.toString() ?? 'Avatar upload failed');
        return;
      }
      if (avRes['user'] is UserModel) {
        latest = avRes['user'] as UserModel;
      }
    }

    final res = await ApiService.updateProfile(
      name: name,
      phone: _phoneCtrl.text.trim(),
      city: _cityCtrl.text.trim(),
    );

    if (!mounted) return;
    setState(() => _saving = false);

    if (res['success'] == true) {
      if (res['user'] is UserModel) {
        latest = res['user'] as UserModel;
      } else {
        latest = latest.copyWith(
          name: name,
          phone: _phoneCtrl.text.trim(),
          city: _cityCtrl.text.trim(),
        );
        AuthService.instance.setUser(latest);
      }
      AppSnackbar.success(context, isDe ? 'Profil erfolgreich gespeichert!' : 'Profile updated successfully!');
      Navigator.pop(context, latest);
    } else {
      AppSnackbar.error(context, res['error']?.toString() ?? 'Update failed');
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDe = Tr.currentLang == 'de';
    final existingUrl = widget.user.resolvedAvatarUrl;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text(isDe ? 'Profil bearbeiten' : 'Edit Profile'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Avatar Picker
            Center(
              child: GestureDetector(
                onTap: _pickAvatar,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Container(
                      width: 108,
                      height: 108,
                      padding: const EdgeInsets.all(3),
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: LinearGradient(
                          colors: [AppColors.primary, AppColors.accentGold],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                      ),
                      child: ClipOval(
                        child: Container(
                          color: AppColors.primaryLight,
                          child: _pickedBytes != null
                              ? Image.memory(_pickedBytes!, fit: BoxFit.cover)
                              : (existingUrl != null
                                  ? Image.network(
                                      existingUrl,
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, __, ___) => _initialsAvatar(),
                                    )
                                  : _initialsAvatar()),
                        ),
                      ),
                    ),
                    Positioned(
                      bottom: 2,
                      right: 2,
                      child: Container(
                        width: 34,
                        height: 34,
                        decoration: BoxDecoration(
                          color: AppColors.primary,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 2.5),
                        ),
                        child: const Icon(Icons.camera_alt_rounded, color: Colors.white, size: 16),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            Center(
              child: TextButton(
                onPressed: _pickAvatar,
                child: Text(
                  isDe ? 'Profilbild ändern' : 'Change Profile Photo',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
            ),
            const SizedBox(height: 16),

            _buildField(
              label: isDe ? 'Vollständiger Name' : 'Full Name',
              hint: isDe ? 'z.B. Max Mustermann' : 'e.g. Max Mustermann',
              controller: _nameCtrl,
              icon: Icons.person_outline_rounded,
            ),
            const SizedBox(height: 16),

            _buildField(
              label: isDe ? 'Telefonnummer' : 'Phone Number',
              hint: '+49 170 1234567',
              controller: _phoneCtrl,
              icon: Icons.phone_outlined,
              keyboardType: TextInputType.phone,
            ),
            const SizedBox(height: 16),

            _buildField(
              label: isDe ? 'Stadt' : 'City',
              hint: isDe ? 'z.B. Frankfurt am Main' : 'e.g. Frankfurt am Main',
              controller: _cityCtrl,
              icon: Icons.location_on_outlined,
            ),
            const SizedBox(height: 28),

            PrimaryActionButton(
              label: _saving
                  ? (isDe ? 'Wird gespeichert...' : 'Saving...')
                  : (isDe ? 'Änderungen speichern' : 'Save Changes'),
              onPressed: _saving ? () {} : _save,
              backgroundColor: AppColors.primary,
            ),
          ],
        ),
      ),
    );
  }

  Widget _initialsAvatar() {
    return Center(
      child: Text(
        widget.user.initials,
        style: const TextStyle(
          color: AppColors.primary,
          fontSize: 32,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }

  Widget _buildField({
    required String label,
    required String hint,
    required TextEditingController controller,
    required IconData icon,
    TextInputType keyboardType = TextInputType.text,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: AppColors.textPrimary,
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          decoration: InputDecoration(
            hintText: hint,
            prefixIcon: Icon(icon, color: AppColors.primary, size: 20),
            filled: true,
            fillColor: AppColors.surface,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: AppColors.border),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: AppColors.border),
            ),
          ),
        ),
      ],
    );
  }
}
