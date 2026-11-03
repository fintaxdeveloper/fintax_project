enum TaskPriority { high, normal, low }

class TodoTask {
  final String id;
  final String title;
  final String? description;
  final String category;
  final String deadline;
  final TaskPriority priority;
  final String? assignedBy;
  bool isCompleted;

  TodoTask({
    required this.id,
    required this.title,
    this.description,
    required this.category,
    required this.deadline,
    this.priority = TaskPriority.normal,
    this.assignedBy,
    this.isCompleted = false,
  });

  String get urgencyLabel {
    switch (priority) {
      case TaskPriority.high:
        return 'DRINGEND';
      case TaskPriority.low:
        return 'NIEDRIG';
      default:
        return 'NORMAL';
    }
  }
}

class PayrollEmployee {
  final String id;
  final String name;
  final String position;
  final String employeeId;
  final bool isActive;
  final String? email;
  final String? phone;
  final String startDate;

  PayrollEmployee({
    required this.id,
    required this.name,
    required this.position,
    required this.employeeId,
    this.isActive = true,
    this.email,
    this.phone,
    required this.startDate,
  });

  String get initials {
    final parts = name.split(' ');
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return name.isNotEmpty ? name[0].toUpperCase() : '?';
  }
}
