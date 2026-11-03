class ProfileSettings {
  final bool pushNotifications;
  final String language;

  ProfileSettings({
    this.pushNotifications = true,
    this.language = 'Deutsch',
  });

  ProfileSettings copyWith({
    bool? pushNotifications,
    String? language,
  }) {
    return ProfileSettings(
      pushNotifications: pushNotifications ?? this.pushNotifications,
      language: language ?? this.language,
    );
  }
}
