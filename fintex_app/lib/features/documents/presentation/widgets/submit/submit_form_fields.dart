import 'package:flutter/material.dart';
import '../../../../../core/theme/app_colors.dart';

/// Small uppercase grey label above a form section ("MONTH", "NOTE"...).
class SubmitFieldLabel extends StatelessWidget {
  final String text;
  const SubmitFieldLabel(this.text, {super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text.toUpperCase(),
        style: const TextStyle(
          color: AppColors.textSecondary,
          fontSize: 11.5,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.6,
        ),
      ),
    );
  }
}

/// Rounded light dropdown used for month and year.
class SubmitDropdown<T> extends StatelessWidget {
  final T value;
  final List<T> items;
  final String Function(T) labelOf;
  final ValueChanged<T> onChanged;

  const SubmitDropdown({
    super.key,
    required this.value,
    required this.items,
    required this.labelOf,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 48,
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<T>(
          value: value,
          isExpanded: true,
          borderRadius: BorderRadius.circular(14),
          icon: const Icon(Icons.keyboard_arrow_down_rounded, color: AppColors.textSecondary),
          style: const TextStyle(
            color: AppColors.textPrimary,
            fontSize: 14.5,
            fontWeight: FontWeight.w700,
          ),
          items: [
            for (final item in items)
              DropdownMenuItem<T>(value: item, child: Text(labelOf(item))),
          ],
          onChanged: (v) {
            if (v != null) onChanged(v);
          },
        ),
      ),
    );
  }
}

/// 2-column grid of checkbox tiles for the document types.
class DocTypeCheckboxGrid extends StatelessWidget {
  final List<String> labels;
  final Set<int> selected;
  final Color color;
  final ValueChanged<int> onToggle;

  const DocTypeCheckboxGrid({
    super.key,
    required this.labels,
    required this.selected,
    required this.color,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final itemWidth = (constraints.maxWidth - 8) / 2;
        return Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (var i = 0; i < labels.length; i++)
              SizedBox(
                width: itemWidth,
                child: _CheckTile(
                  label: labels[i],
                  checked: selected.contains(i),
                  color: color,
                  onTap: () => onToggle(i),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _CheckTile extends StatelessWidget {
  final String label;
  final bool checked;
  final Color color;
  final VoidCallback onTap;

  const _CheckTile({
    required this.label,
    required this.checked,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: checked ? color.withValues(alpha: 0.08) : AppColors.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          constraints: const BoxConstraints(minHeight: 46),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: checked ? color.withValues(alpha: 0.45) : AppColors.border,
            ),
          ),
          child: Row(
            children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                width: 18,
                height: 18,
                decoration: BoxDecoration(
                  color: checked ? color : Colors.transparent,
                  borderRadius: BorderRadius.circular(5),
                  border: Border.all(
                    color: checked ? color : AppColors.borderStrong,
                    width: 1.5,
                  ),
                ),
                child: checked
                    ? const Icon(Icons.check_rounded, size: 13, color: Colors.white)
                    : null,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: checked ? color : AppColors.textPrimary,
                    fontSize: 12.5,
                    fontWeight: checked ? FontWeight.w700 : FontWeight.w500,
                    height: 1.2,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Multi-line note field with a warm light background.
class SubmitNoteField extends StatelessWidget {
  final TextEditingController controller;
  final String hint;

  const SubmitNoteField({super.key, required this.controller, required this.hint});

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      minLines: 2,
      maxLines: 4,
      style: const TextStyle(fontSize: 13.5, color: AppColors.textPrimary),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: AppColors.textTertiary, fontSize: 13),
        filled: true,
        fillColor: const Color(0xFFFCFBF7),
        contentPadding: const EdgeInsets.all(14),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.primary, width: 1.4),
        ),
      ),
    );
  }
}
