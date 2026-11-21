import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/l10n/translations.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/empty_state.dart';
import '../../../../models/document_item.dart';
import '../../../../services/api_service.dart';
import '../../../authentication/models/user_model.dart';
import '../../../payroll/presentation/screens/payroll_screen.dart';
import '../../models/folder_config.dart';
import '../widgets/document_list_tile.dart';
import '../widgets/submit/pipeline_steps_card.dart';
import '../widgets/submit/required_docs_checklist.dart';
import '../widgets/submit/submit_form_fields.dart';
import '../widgets/submit/submit_header_card.dart';
import '../widgets/submit/upload_drop_zone.dart';

/// Opened from the 4 folder cards on Home. Top: submit form (period,
/// document types, files, note). Bottom: documents already in the folder.
class FolderSubmitScreen extends StatefulWidget {
  final UserModel user;
  final FolderConfig folder;

  const FolderSubmitScreen({super.key, required this.user, required this.folder});

  @override
  State<FolderSubmitScreen> createState() => _FolderSubmitScreenState();
}

class _FolderSubmitScreenState extends State<FolderSubmitScreen> {
  static const _months = [
    L('January', 'Januar'), L('February', 'Februar'), L('March', 'März'),
    L('April', 'April'), L('May', 'Mai'), L('June', 'Juni'),
    L('July', 'Juli'), L('August', 'August'), L('September', 'September'),
    L('October', 'Oktober'), L('November', 'November'), L('December', 'Dezember'),
  ];

  static const _pipelineSteps = [
    L('PDF / Image Upload', 'PDF- / Bild-Upload'),
    L('Document Type Detect', 'Belegart erkennen'),
    L('OCR Text & Layout Scan', 'OCR Text & Layout'),
    L('AI Data Extraction', 'KI-Datenextraktion'),
    L('Invoice & Date (Year/Month)', 'Rechnung & Datum (Jahr/Monat)'),
    L('SKR03 Account & CSV in Year/Month Folder', 'SKR03-Konto & CSV im Jahr/Monat-Ordner'),
  ];

  final ImagePicker _picker = ImagePicker();
  final TextEditingController _noteController = TextEditingController();
  final TextEditingController _searchController = TextEditingController();

  late int _month;
  late int _year;
  final Set<int> _selectedTypes = {};
  final List<XFile> _files = [];
  bool _submitting = false;

  List<DocumentItem> _documents = [];
  final List<DocumentItem> _justUploaded = [];
  bool _loading = true;
  int _filter = 0; // 0 all, 1 approved, 2 in review

  FolderConfig get f => widget.folder;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _month = now.month - 1;
    _year = now.year;
    _searchController.addListener(() => setState(() {}));
    _loadDocs();
  }

  @override
  void dispose() {
    _noteController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadDocs() async {
    setState(() => _loading = true);
    final all = await ApiService.fetchClientDocuments(clientId: widget.user.id);
    if (!mounted) return;
    setState(() {
      _documents = all.where((d) => d.category == f.categoryKey).toList();
      _loading = false;
    });
  }

  List<DocumentItem> get _allDocs => [..._justUploaded, ..._documents];

  List<DocumentItem> get _visibleDocs {
    final q = _searchController.text.trim().toLowerCase();
    return _allDocs.where((d) {
      final matchesFilter = switch (_filter) {
        1 => d.status == 'APPROVED',
        2 => d.status != 'APPROVED',
        _ => true,
      };
      final matchesSearch = q.isEmpty ||
          d.originalFilename.toLowerCase().contains(q) ||
          (d.supplierName ?? '').toLowerCase().contains(q);
      return matchesFilter && matchesSearch;
    }).toList();
  }

  // ---------------------------------------------------------------- picking

  Future<void> _chooseSource() async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 12),
              _SourceTile(
                icon: Icons.photo_camera_outlined,
                label: const L('Take photo (Camera)', 'Foto aufnehmen (Kamera)').text,
                color: f.color,
                onTap: () => Navigator.pop(ctx, 'camera'),
              ),
              _SourceTile(
                icon: Icons.photo_library_outlined,
                label: const L('Choose from gallery', 'Aus Galerie wählen').text,
                color: f.color,
                onTap: () => Navigator.pop(ctx, 'gallery'),
              ),
              _SourceTile(
                icon: Icons.picture_as_pdf_outlined,
                label: const L('Upload PDF / Document from device', 'PDF / Dokument vom Gerät wählen').text,
                color: AppColors.redText,
                onTap: () => Navigator.pop(ctx, 'pdf'),
              ),
            ],
          ),
        ),
      ),
    );
    if (choice == null) return;

    try {
      if (choice == 'camera') {
        final photo = await _picker.pickImage(source: ImageSource.camera, imageQuality: 85);
        if (photo != null) setState(() => _files.add(photo));
      } else if (choice == 'gallery') {
        final picked = await _picker.pickMultiImage(imageQuality: 85);
        if (picked.isNotEmpty) setState(() => _files.addAll(picked));
      } else if (choice == 'pdf') {
        final result = await FilePicker.platform.pickFiles(
          type: FileType.custom,
          allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'csv', 'xlsx'],
          allowMultiple: true,
          withData: true,
        );
        if (result != null && result.files.isNotEmpty) {
          final added = <XFile>[];
          for (final pf in result.files) {
            if (pf.path != null && pf.path!.isNotEmpty) {
              added.add(XFile(pf.path!, name: pf.name));
            } else if (pf.bytes != null) {
              added.add(XFile.fromData(pf.bytes!, name: pf.name));
            }
          }
          if (added.isNotEmpty) {
            setState(() => _files.addAll(added));
          }
        }
      }
    } catch (_) {
      if (mounted) {
        AppSnackbar.error(context, const L('Could not open files.', 'Dateien konnten nicht geöffnet werden.').text);
      }
    }
  }

  // ----------------------------------------------------------------- submit

  Future<void> _submit() async {
    if (_files.isEmpty) {
      AppSnackbar.warning(context, const L('Please select at least one file.', 'Bitte mindestens eine Datei auswählen.').text);
      return;
    }
    setState(() => _submitting = true);

    final prefix = f.showPeriod ? '$_year-${(_month + 1).toString().padLeft(2, '0')}_' : '';
    final selectedSubTypes = _selectedTypes
        .where((idx) => idx >= 0 && idx < f.documentTypes.length)
        .map((idx) => f.documentTypes[idx].text)
        .toList();
    final uploaded = <DocumentItem>[];
    var failed = 0;

    for (final file in _files) {
      final bytes = await file.readAsBytes();
      final name = '$prefix${file.name}';
      final res = await ApiService.uploadDocument(
        filename: name,
        category: f.categoryKey,
        clientId: widget.user.id,
        bytes: bytes,
        notes: _noteController.text.trim(),
        subTypes: selectedSubTypes,
        year: f.showPeriod ? _year : null,
        month: f.showPeriod ? (_month + 1) : null,
      );
      if (res['success'] == true) {
        if (res['document'] is DocumentItem) {
          uploaded.add(res['document'] as DocumentItem);
        } else {
          final now = DateTime.now();
          uploaded.add(DocumentItem(
            id: 'local_${now.microsecondsSinceEpoch}',
            originalFilename: name,
            category: f.categoryKey,
            sectionName: f.title.text,
            date: '${now.day.toString().padLeft(2, '0')}.${now.month.toString().padLeft(2, '0')}.${now.year}',
            status: 'PROCESSING',
            sizeBytes: bytes.length,
            mimeType: 'image/jpeg',
          ));
        }
      } else {
        failed++;
      }
    }

    if (!mounted) return;
    setState(() {
      _submitting = false;
      _justUploaded.insertAll(0, uploaded);
      if (failed == 0) {
        _files.clear();
        _selectedTypes.clear();
        _noteController.clear();
      }
    });

    if (failed == 0) {
      AppSnackbar.success(
        context,
        L('${uploaded.length} document(s) submitted', '${uploaded.length} Dokument(e) eingereicht').text,
      );
    } else {
      AppSnackbar.error(context, Tr.get('uploadFailed'));
    }
  }

  // ------------------------------------------------------------------ build

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: Tr.languageNotifier,
      builder: (context, _, _) {
        return Scaffold(
          backgroundColor: AppColors.background,
          appBar: AppBar(
            backgroundColor: AppColors.background,
            surfaceTintColor: Colors.transparent,
            elevation: 0,
            title: Text(
              f.title.text,
              style: const TextStyle(
                color: AppColors.textPrimary,
                fontSize: 18,
                fontWeight: FontWeight.w800,
              ),
            ),
            iconTheme: const IconThemeData(color: AppColors.textPrimary),
          ),
          body: RefreshIndicator(
            color: f.color,
            onRefresh: _loadDocs,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 40),
              children: [
                SubmitHeaderCard(
                  icon: f.icon,
                  color: f.color,
                  lightColor: f.lightColor,
                  title: f.submitTitle.text,
                  subtitle: f.subtitle.text,
                  countLabel: L('${_allDocs.length} documents', '${_allDocs.length} Dokumente').text,
                ),
                if (f.showPipeline) ...[
                  const SizedBox(height: 14),
                  PipelineStepsCard(
                    title: const L('Automatic AI Accounting Pipeline', 'Automatische KI-Buchhaltung').text,
                    steps: _pipelineSteps.map((s) => s.text).toList(),
                  ),
                ],
                if (f.checklist.isNotEmpty) ...[
                  const SizedBox(height: 18),
                  SubmitFieldLabel(const L('Required documents', 'Benötigte Unterlagen').text),
                  RequiredDocsChecklist(
                    pendingLabel: const L('Pending', 'Offen').text,
                    uploadedLabel: const L('Uploaded', 'Hochgeladen').text,
                    items: [
                      for (final r in f.checklist)
                        RequiredDocStatus(r.title.text, r.subtitle.text, _isUploaded(r)),
                    ],
                  ),
                ],
                if (f.categoryKey == FolderConfig.payroll.categoryKey) ...[
                  const SizedBox(height: 14),
                  _ManageEmployeesTile(
                    color: f.color,
                    lightColor: f.lightColor,
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => PayrollScreen(user: widget.user)),
                    ),
                  ),
                ],
                const SizedBox(height: 18),
                _buildForm(),
                const SizedBox(height: 26),
                _buildUploadedSection(),
              ],
            ),
          ),
        );
      },
    );
  }

  bool _isUploaded(RequiredDoc r) {
    return _allDocs.any((d) {
      final name = d.originalFilename.toLowerCase();
      return r.keywords.any(name.contains);
    });
  }

  Widget _buildForm() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: AppColors.borderLight),
        boxShadow: const [
          BoxShadow(color: AppColors.shadowLight, blurRadius: 14, offset: Offset(0, 6)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (f.showPeriod) ...[
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SubmitFieldLabel(const L('Month', 'Monat').text),
                      SubmitDropdown<int>(
                        value: _month,
                        items: List.generate(12, (i) => i),
                        labelOf: (i) => _months[i].text,
                        onChanged: (v) => setState(() => _month = v),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SubmitFieldLabel(const L('Year', 'Jahr').text),
                      SubmitDropdown<int>(
                        value: _year,
                        items: List.generate(4, (i) => DateTime.now().year - 2 + i),
                        labelOf: (y) => '$y',
                        onChanged: (v) => setState(() => _year = v),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
          ],
          SubmitFieldLabel(const L('Document types', 'Dokumentarten').text),
          DocTypeCheckboxGrid(
            labels: f.documentTypes.map((t) => t.text).toList(),
            selected: _selectedTypes,
            color: f.color,
            onToggle: (i) => setState(() {
              if (!_selectedTypes.remove(i)) _selectedTypes.add(i);
            }),
          ),
          const SizedBox(height: 18),
          UploadDropZone(
            color: f.color,
            title: const L('Select files', 'Dateien auswählen').text,
            hint: const L('Photos or scans · camera or gallery', 'Fotos oder Scans · Kamera oder Galerie').text,
            fileNames: _files.map((x) => x.name).toList(),
            onTap: _submitting ? () {} : _chooseSource,
            onRemove: (i) => setState(() => _files.removeAt(i)),
          ),
          const SizedBox(height: 18),
          SubmitFieldLabel(const L('Note (optional)', 'Notiz (optional)').text),
          SubmitNoteField(controller: _noteController, hint: f.notePlaceholder.text),
          const SizedBox(height: 18),
          SizedBox(
            height: 52,
            child: ElevatedButton(
              onPressed: _submitting ? null : _submit,
              style: ElevatedButton.styleFrom(
                backgroundColor: f.color,
                foregroundColor: Colors.white,
                disabledBackgroundColor: f.color.withValues(alpha: 0.5),
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              ),
              child: _submitting
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
                    )
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          L(
                            _files.isEmpty ? 'Submit Documents' : 'Submit ${_files.length} file(s)',
                            _files.isEmpty ? 'Dokumente einreichen' : '${_files.length} Datei(en) einreichen',
                          ).text,
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
                        ),
                        const SizedBox(width: 8),
                        const Icon(Icons.arrow_forward_rounded, size: 18),
                      ],
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildUploadedSection() {
    final docs = _visibleDocs;
    final filters = [
      const L('All', 'Alle').text,
      const L('Approved', 'Geprüft').text,
      const L('In review', 'In Prüfung').text,
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                L('Uploaded files (${_allDocs.length})', 'Hochgeladene Dateien (${_allDocs.length})').text,
                style: const TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.successLight,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.verified_user_outlined, size: 13, color: AppColors.success),
                  const SizedBox(width: 4),
                  Text(
                    const L('Synced', 'Synchronisiert').text,
                    style: const TextStyle(
                      color: AppColors.success,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _searchController,
          style: const TextStyle(fontSize: 13.5),
          decoration: InputDecoration(
            hintText: const L('Search documents…', 'Dokumente suchen…').text,
            hintStyle: const TextStyle(color: AppColors.textTertiary, fontSize: 13.5),
            prefixIcon: const Icon(Icons.search_rounded, color: AppColors.textTertiary),
            filled: true,
            fillColor: AppColors.surface,
            isDense: true,
            contentPadding: const EdgeInsets.symmetric(vertical: 13),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: AppColors.border),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(color: f.color, width: 1.4),
            ),
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            for (var i = 0; i < filters.length; i++)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: GestureDetector(
                  onTap: () => setState(() => _filter = i),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                    decoration: BoxDecoration(
                      color: _filter == i ? f.lightColor : AppColors.surface,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: _filter == i ? f.color.withValues(alpha: 0.4) : AppColors.border,
                      ),
                    ),
                    child: Text(
                      filters[i],
                      style: TextStyle(
                        color: _filter == i ? f.color : AppColors.textSecondary,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 12),
        if (_loading)
          Padding(
            padding: const EdgeInsets.all(32),
            child: Center(child: CircularProgressIndicator(color: f.color)),
          )
        else if (docs.isEmpty)
          EmptyState(
            icon: f.icon,
            title: const L('No documents yet', 'Noch keine Dokumente').text,
            subtitle: const L('Use the form above to submit your first document.',
                    'Nutzen Sie das Formular oben, um Dokumente einzureichen.')
                .text,
          )
        else
          for (final doc in docs) DocumentListTile(document: doc, themeColor: f.color),
      ],
    );
  }
}

class _SourceTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _SourceTile({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: onTap,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      leading: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(icon, color: color),
      ),
      title: Text(label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
    );
  }
}

class _ManageEmployeesTile extends StatelessWidget {
  final Color color;
  final Color lightColor;
  final VoidCallback onTap;

  const _ManageEmployeesTile({
    required this.color,
    required this.lightColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: color.withValues(alpha: 0.2)),
          ),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: lightColor,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(Icons.badge_outlined, color: color, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  const L('Manage employees', 'Mitarbeiter verwalten').text,
                  style: const TextStyle(
                    color: AppColors.textPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: color),
            ],
          ),
        ),
      ),
    );
  }
}
