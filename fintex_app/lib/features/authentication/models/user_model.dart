class UserModel {
  final String id;
  final String name;
  final String email;
  final String clientNumber;
  final String token;
  final String role; // CLIENT, STAFF, ADMIN
  final bool isFirstLogin;
  final String? companyName;

  UserModel({
    required this.id,
    required this.name,
    required this.email,
    required this.clientNumber,
    required this.token,
    this.role = 'CLIENT',
    this.isFirstLogin = false,
    this.companyName,
  });

  factory UserModel.fromJson(Map<String, dynamic> json, String token) {
    return UserModel(
      id: json['id'] ?? '',
      name: json['name'] ?? 'Mandant',
      email: json['email'] ?? '',
      clientNumber: json['clientNumber'] ?? json['client_number'] ?? 'KD-10042',
      token: token,
      role: (json['role'] ?? 'CLIENT').toString().toUpperCase(),
      isFirstLogin: json['is_first_login'] ?? json['first_login_done'] == false,
      companyName: json['company_name'],
    );
  }

  String get initials {
    final parts = name.split(' ');
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return name.isNotEmpty ? name[0].toUpperCase() : '?';
  }

  String get displayName {
    return companyName ?? name;
  }
}

typedef UserSession = UserModel;
