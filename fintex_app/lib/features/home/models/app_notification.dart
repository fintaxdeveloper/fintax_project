import 'package:flutter/material.dart';
import '../../../core/l10n/translations.dart';
import '../../../core/theme/app_colors.dart';

enum NotificationType { document, deadline, message, review, payroll, tax }

extension NotificationTypeStyle on NotificationType {
  IconData get icon => switch (this) {
        NotificationType.document => Icons.task_alt_rounded,
        NotificationType.deadline => Icons.schedule_rounded,
        NotificationType.message => Icons.chat_bubble_outline_rounded,
        NotificationType.review => Icons.error_outline_rounded,
        NotificationType.payroll => Icons.groups_rounded,
        NotificationType.tax => Icons.account_balance_rounded,
      };

  Color get color => switch (this) {
        NotificationType.document => AppColors.emeraldIcon,
        NotificationType.deadline => AppColors.orangeIcon,
        NotificationType.message => AppColors.blueIcon,
        NotificationType.review => AppColors.redText,
        NotificationType.payroll => AppColors.purpleIcon,
        NotificationType.tax => AppColors.indigoIcon,
      };

  Color get lightColor => switch (this) {
        NotificationType.document => AppColors.emeraldBox,
        NotificationType.deadline => AppColors.orangeBox,
        NotificationType.message => AppColors.blueBox,
        NotificationType.review => AppColors.redBox,
        NotificationType.payroll => AppColors.purpleBox,
        NotificationType.tax => AppColors.indigoBox,
      };
}

/// A single notification. [titleKey] and [bodyKey] are translation keys so
/// the text follows the selected language.
class AppNotification {
  final String id;
  final NotificationType type;
  final String titleKey;
  final String bodyKey;
  final String? titleEn;
  final String? titleDe;
  final String? bodyEn;
  final String? bodyDe;
  final DateTime time;
  bool isRead;

  AppNotification({
    required this.id,
    required this.type,
    this.titleKey = '',
    this.bodyKey = '',
    this.titleEn,
    this.titleDe,
    this.bodyEn,
    this.bodyDe,
    required this.time,
    this.isRead = false,
  });

  String get resolvedTitle {
    if (titleEn != null || titleDe != null) {
      return Tr.currentLang == 'de' ? (titleDe ?? titleEn ?? '') : (titleEn ?? titleDe ?? '');
    }
    return Tr.get(titleKey);
  }

  String get resolvedBody {
    if (bodyEn != null || bodyDe != null) {
      return Tr.currentLang == 'de' ? (bodyDe ?? bodyEn ?? '') : (bodyEn ?? bodyDe ?? '');
    }
    return Tr.get(bodyKey);
  }

  /// Dummy data until the backend provides a notifications endpoint.
  static List<AppNotification> demo() {
    final now = DateTime.now();
    return [
      AppNotification(
        id: 'n1',
        type: NotificationType.deadline,
        titleKey: 'notifDeadlineTitle',
        bodyKey: 'notifDeadlineBody',
        time: now.subtract(const Duration(minutes: 12)),
      ),
      AppNotification(
        id: 'n2',
        type: NotificationType.message,
        titleKey: 'notifMessageTitle',
        bodyKey: 'notifMessageBody',
        time: now.subtract(const Duration(hours: 1)),
      ),
      AppNotification(
        id: 'n3',
        type: NotificationType.document,
        titleKey: 'notifDocCheckedTitle',
        bodyKey: 'notifDocCheckedBody',
        time: now.subtract(const Duration(hours: 3)),
      ),
      AppNotification(
        id: 'n4',
        type: NotificationType.review,
        titleKey: 'notifReviewTitle',
        bodyKey: 'notifReviewBody',
        time: now.subtract(const Duration(days: 1, hours: 2)),
        isRead: true,
      ),
      AppNotification(
        id: 'n5',
        type: NotificationType.payroll,
        titleKey: 'notifPayrollTitle',
        bodyKey: 'notifPayrollBody',
        time: now.subtract(const Duration(days: 2)),
        isRead: true,
      ),
      AppNotification(
        id: 'n6',
        type: NotificationType.tax,
        titleKey: 'notifTaxTitle',
        bodyKey: 'notifTaxBody',
        time: now.subtract(const Duration(days: 4)),
        isRead: true,
      ),
      AppNotification(
        id: 'n7',
        type: NotificationType.deadline,
        titleKey: 'notifTimesheetTitle',
        bodyKey: 'notifTimesheetBody',
        time: now.subtract(const Duration(days: 5)),
        isRead: true,
      ),
    ];
  }
}
