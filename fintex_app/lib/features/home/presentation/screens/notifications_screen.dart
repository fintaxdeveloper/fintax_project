import 'package:flutter/material.dart';
import '../../../../core/l10n/translations.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/empty_state.dart';
import '../../../../models/document_item.dart';
import '../../../../models/todo_task.dart';
import '../../../../services/api_service.dart';
import '../../../authentication/models/user_model.dart';
import '../../models/app_notification.dart';
import '../widgets/notification_filter_bar.dart';
import '../widgets/notification_tile.dart';

class NotificationsScreen extends StatefulWidget {
  final UserModel user;
  const NotificationsScreen({super.key, required this.user});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  static const _filterKeys = [
    'filterAll',
    'filterUnread',
    'filterDocuments',
    'filterDeadlines',
    'filterMessages',
  ];

  final List<AppNotification> _items = [];
  bool _loading = true;
  int _filter = 0;

  @override
  void initState() {
    super.initState();
    _loadNotifications();
  }

  Future<void> _loadNotifications() async {
    setState(() => _loading = true);
    final results = await Future.wait([
      ApiService.fetchClientDocuments(clientId: widget.user.id),
      ApiService.fetchTasks(clientId: widget.user.id),
      ApiService.fetchCorrespondence(),
    ]);
    if (!mounted) return;

    final docs = results[0] as List<DocumentItem>;
    final tasks = results[1] as List<TodoTask>;
    final letters = results[2] as List<Map<String, dynamic>>;

    final built = <AppNotification>[];

    for (final doc in docs.take(10)) {
      DateTime ts;
      try {
        ts = DateTime.parse(doc.date);
      } catch (_) {
        ts = DateTime.now();
      }
      final isReview = doc.status == 'NEEDS_ATTENTION' || doc.status == 'READY_FOR_REVIEW';
      built.add(AppNotification(
        id: 'doc_${doc.id}',
        type: isReview ? NotificationType.review : NotificationType.document,
        titleEn: isReview ? 'Document needs review' : 'Document processed',
        titleDe: isReview ? 'Beleg in Prüfung' : 'Beleg verarbeitet',
        bodyEn: '${doc.originalFilename} (${doc.status})',
        bodyDe: '${doc.originalFilename} (${doc.status})',
        time: ts,
        isRead: !isReview, titleKey: '', bodyKey: '',
      ));
    }

    for (final t in tasks) {
      built.add(AppNotification(
        id: 'task_${t.id}',
        type: NotificationType.deadline,
        titleEn: t.title,
        titleDe: t.title,
        bodyEn: t.description ?? 'Due: ${t.deadline}',
        bodyDe: t.description ?? 'Fällig: ${t.deadline}',
        time: DateTime.now(),
        isRead: t.isCompleted, titleKey: '', bodyKey: '',
      ));
    }

    for (final l in letters.take(5)) {
      built.add(AppNotification(
        id: 'corr_${l['id'] ?? built.length}',
        type: NotificationType.tax,
        titleEn: (l['letter_type'] ?? 'Tax Correspondence').toString(),
        titleDe: (l['letter_type'] ?? 'Finanzamt-Schreiben').toString(),
        bodyEn: (l['ai_summary'] ?? l['sender'] ?? '').toString(),
        bodyDe: (l['ai_summary'] ?? l['sender'] ?? '').toString(),
        time: DateTime.now(),
        isRead: false,
      ));
    }

    setState(() {
      _items
        ..clear()
        ..addAll(built);
      _loading = false;
    });
  }

  int get _unreadCount => _items.where((n) => !n.isRead).length;

  List<AppNotification> get _visible {
    return _items.where((n) {
      switch (_filter) {
        case 1:
          return !n.isRead;
        case 2:
          return n.type == NotificationType.document ||
              n.type == NotificationType.review ||
              n.type == NotificationType.payroll;
        case 3:
          return n.type == NotificationType.deadline || n.type == NotificationType.tax;
        case 4:
          return n.type == NotificationType.message;
        default:
          return true;
      }
    }).toList()
      ..sort((a, b) => b.time.compareTo(a.time));
  }

  bool _isToday(DateTime t) {
    final now = DateTime.now();
    return t.year == now.year && t.month == now.month && t.day == now.day;
  }

  String _timeLabel(DateTime t) {
    final diff = DateTime.now().difference(t);
    if (diff.inMinutes < 60) {
      return Tr.get('minutesAgo').replaceAll('{n}', '${diff.inMinutes.clamp(1, 59)}');
    }
    if (diff.inHours < 24) {
      return Tr.get('hoursAgo').replaceAll('{n}', '${diff.inHours}');
    }
    if (diff.inDays == 1) return Tr.get('yesterday');
    return Tr.get('daysAgo').replaceAll('{n}', '${diff.inDays}');
  }

  void _markAllRead() {
    setState(() {
      for (final n in _items) {
        n.isRead = true;
      }
    });
  }

  void _remove(AppNotification n) {
    final index = _items.indexOf(n);
    setState(() => _items.removeAt(index));
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(Tr.get('notifRemoved')),
          behavior: SnackBarBehavior.floating,
          action: SnackBarAction(
            label: Tr.get('undo'),
            onPressed: () => setState(() => _items.insert(index, n)),
          ),
        ),
      );
  }

  Future<void> _refresh() async {
    await _loadNotifications();
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: Tr.languageNotifier,
      builder: (context, _, _) {
        final visible = _visible;
        final today = visible.where((n) => _isToday(n.time)).toList();
        final earlier = visible.where((n) => !_isToday(n.time)).toList();

        return Scaffold(
          backgroundColor: AppColors.background,
          body: SafeArea(
            child: RefreshIndicator(
              color: AppColors.primary,
              onRefresh: _refresh,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.only(top: 20, bottom: 120),
                children: [
                  _buildHeader(),
                  const SizedBox(height: 18),
                  NotificationFilterBar(
                    labels: _filterKeys.map(Tr.get).toList(),
                    selectedIndex: _filter,
                    onChanged: (i) => setState(() => _filter = i),
                  ),
                  const SizedBox(height: 8),
                  if (_loading)
                    const Padding(
                      padding: EdgeInsets.all(40),
                      child: Center(child: CircularProgressIndicator(color: AppColors.primary)),
                    )
                  else if (visible.isEmpty)
                    EmptyState(
                      icon: Icons.notifications_off_outlined,
                      title: Tr.get('noNotifications'),
                      subtitle: Tr.get('noNotificationsSub'),
                    )
                  else ...[
                    if (today.isNotEmpty) ..._buildSection(Tr.get('today'), today),
                    if (earlier.isNotEmpty) ..._buildSection(Tr.get('earlier'), earlier),
                  ],
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildHeader() {
    final unread = _unreadCount;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  Tr.get('notifications'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.textPrimary,
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    if (unread > 0) ...[
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.accentGoldLight,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          Tr.get('unreadCount').replaceAll('{count}', '$unread'),
                          style: const TextStyle(
                            color: AppColors.accentGoldDark,
                            fontSize: 11.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                    ],
                    Flexible(
                      child: Text(
                        Tr.get('notificationsSub'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: AppColors.textSecondary,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          if (unread > 0)
            TextButton.icon(
              onPressed: _markAllRead,
              style: TextButton.styleFrom(
                foregroundColor: AppColors.primary,
                backgroundColor: AppColors.primaryLight,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              icon: const Icon(Icons.done_all_rounded, size: 18),
              label: Text(
                Tr.get('markAllRead'),
                style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700),
              ),
            ),
        ],
      ),
    );
  }

  List<Widget> _buildSection(String title, List<AppNotification> items) {
    return [
      Padding(
        padding: const EdgeInsets.fromLTRB(24, 18, 20, 10),
        child: Text(
          title.toUpperCase(),
          style: const TextStyle(
            color: AppColors.textTertiary,
            fontSize: 12,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
          ),
        ),
      ),
      for (final n in items)
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
          child: Dismissible(
            key: ValueKey(n.id),
            direction: DismissDirection.endToStart,
            onDismissed: (_) => _remove(n),
            background: Container(
              alignment: Alignment.centerRight,
              padding: const EdgeInsets.only(right: 22),
              decoration: BoxDecoration(
                color: AppColors.redBox,
                borderRadius: BorderRadius.circular(18),
              ),
              child: const Icon(Icons.delete_outline_rounded, color: AppColors.redText),
            ),
            child: NotificationTile(
              notification: n,
              title: n.resolvedTitle,
              body: n.resolvedBody,
              timeLabel: _timeLabel(n.time),
              onTap: () => setState(() => n.isRead = true),
            ),
          ),
        ),
    ];
  }
}
