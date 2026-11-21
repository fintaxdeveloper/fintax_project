import '../../../core/constants/app_constants.dart';

class UserModel {
  final String id;
  final String name;
  final String email;
  final String clientNumber;
  final String token;
  final String role; // CLIENT, STAFF, ADMIN
  final bool isFirstLogin;
  final String? companyName;
  final String? phone;
  final String? city;
  final String? profileImage;

  UserModel({
    required this.id,
    required this.name,
    required this.email,
    required this.clientNumber,
    required this.token,
    this.role = 'CLIENT',
    this.isFirstLogin = false,
    this.companyName,
    this.phone,
    this.city,
    this.profileImage,
  });

  factory UserModel.fromJson(Map<String, dynamic> json, String token) {
    final rawImg = (json['profile_image'] ?? json['profileImage'] ?? '').toString().trim();
    final rawPhone = (json['phone'] ?? '').toString().trim();
    final rawCity = (json['city'] ?? '').toString().trim();
    return UserModel(
      id: (json['id'] ?? '').toString(),
      name: (json['name'] ?? 'Mandant').toString(),
      email: (json['email'] ?? '').toString(),
      clientNumber: (json['clientNumber'] ?? json['client_number'] ?? '').toString(),
      token: token,
      role: (json['role'] ?? 'CLIENT').toString().toUpperCase(),
      isFirstLogin: json['is_first_login'] == true || json['first_login_done'] == false,
      companyName: json['company_name']?.toString(),
      phone: rawPhone.isNotEmpty ? rawPhone : null,
      city: rawCity.isNotEmpty ? rawCity : null,
      profileImage: rawImg.isNotEmpty ? rawImg : null,
    );
  }

  UserModel copyWith({
    String? name,
    String? email,
    String? clientNumber,
    String? token,
    String? role,
    bool? isFirstLogin,
    String? companyName,
    String? phone,
    String? city,
    String? profileImage,
  }) {
    return UserModel(
      id: id,
      name: name ?? this.name,
      email: email ?? this.email,
      clientNumber: clientNumber ?? this.clientNumber,
      token: token ?? this.token,
      role: role ?? this.role,
      isFirstLogin: isFirstLogin ?? this.isFirstLogin,
      companyName: companyName ?? this.companyName,
      phone: phone ?? this.phone,
      city: city ?? this.city,
      profileImage: profileImage ?? this.profileImage,
    );
  }

  String? get resolvedAvatarUrl {
    final raw = profileImage?.trim();
    if (raw == null || raw.isEmpty) return null;
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    // Strip trailing /api from apiBaseUrl to get origin (e.g. https://fintax.westpointtrading.com)
    final origin = AppConstants.apiBaseUrl.replaceFirst(RegExp(r'/api/?$'), '');
    return '$origin${raw.startsWith('/') ? raw : '/$raw'}';
  }

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.length >= 2 && parts[0].isNotEmpty && parts[1].isNotEmpty) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return name.isNotEmpty ? name[0].toUpperCase() : '?';
  }

  String get displayName {
    return (companyName != null && companyName!.isNotEmpty) ? companyName! : name;
  }
}

typedef UserSession = UserModel;
