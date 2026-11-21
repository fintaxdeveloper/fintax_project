import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/status_badge.dart';
import '../../../../models/document_item.dart';
import '../../../../services/api_service.dart';

/// Opens any document (PDF or image) from the live FinTax backend with JWT auth.
/// Images render directly in-app with pinch-to-zoom; PDFs are downloaded to a
/// temporary file and opened immediately in the device's native PDF viewer.
class DocumentViewerScreen extends StatefulWidget {
  final DocumentItem document;

  const DocumentViewerScreen({super.key, required this.document});

  @override
  State<DocumentViewerScreen> createState() => _DocumentViewerScreenState();
}

class _DocumentViewerScreenState extends State<DocumentViewerScreen> {
  bool _loading = true;
  String? _error;
  Uint8List? _bytes;
  String? _savedPath;
  bool _isImage = false;
  bool _openingExternal = false;

  @override
  void initState() {
    super.initState();
    _loadAndOpen();
  }

  Future<void> _loadAndOpen() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    final result = await ApiService.downloadDocumentBytes(widget.document.id);
    if (!mounted) return;

    if (result.bytes == null || result.bytes!.isEmpty) {
      setState(() {
        _loading = false;
        _error = result.error ?? 'Dokument konnte nicht geladen werden.';
      });
      return;
    }

    final bytes = result.bytes!;
    final lowerName = widget.document.originalFilename.toLowerCase();
    final contentType = (result.contentType ?? widget.document.mimeType ?? '').toLowerCase();
    final isImg = contentType.startsWith('image/') ||
        lowerName.endsWith('.jpg') ||
        lowerName.endsWith('.jpeg') ||
        lowerName.endsWith('.png') ||
        lowerName.endsWith('.webp');

    String? savedPath;
    try {
      final dir = await getTemporaryDirectory();
      final safeName = widget.document.originalFilename.replaceAll(RegExp(r'[^\w.\- ()]'), '_');
      final fileName = safeName.isEmpty ? 'document_${widget.document.id}.pdf' : safeName;
      final file = File('${dir.path}${Platform.pathSeparator}$fileName');
      await file.writeAsBytes(bytes, flush: true);
      savedPath = file.path;
    } catch (_) {
      savedPath = null;
    }

    if (!mounted) return;
    setState(() {
      _bytes = bytes;
      _savedPath = savedPath;
      _isImage = isImg;
      _loading = false;
    });

    // Automatically launch native PDF viewer for PDFs and non-image documents
    if (!isImg && savedPath != null) {
      await _openExternally();
    }
  }

  Future<void> _openExternally() async {
    if (_savedPath == null || _openingExternal) return;
    setState(() => _openingExternal = true);
    try {
      final res = await OpenFilex.open(_savedPath!);
      if (!mounted) return;
      if (res.type != ResultType.done) {
        AppSnackbar.warning(
          context,
          res.message.isNotEmpty ? res.message : 'PDF-Viewer konnte nicht geöffnet werden.',
        );
      }
    } catch (e) {
      if (mounted) {
        AppSnackbar.error(context, 'Fehler beim Öffnen: $e');
      }
    } finally {
      if (mounted) setState(() => _openingExternal = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final doc = widget.document;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        title: Text(
          doc.originalFilename,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        ),
        actions: [
          if (_savedPath != null)
            IconButton(
              tooltip: 'Open PDF / File',
              icon: const Icon(Icons.open_in_new_rounded),
              onPressed: _openExternally,
            ),
        ],
      ),
      body: _buildBody(doc),
    );
  }

  Widget _buildBody(DocumentItem doc) {
    if (_loading) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: AppColors.primary),
            SizedBox(height: 16),
            Text(
              'Dokument wird geladen...',
              style: TextStyle(color: AppColors.textSecondary, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      );
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline_rounded, size: 52, color: AppColors.error),
              const SizedBox(height: 14),
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.textPrimary, fontSize: 14, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 18),
              ElevatedButton.icon(
                onPressed: _loadAndOpen,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Erneut versuchen'),
              ),
            ],
          ),
        ),
      );
    }

    if (_isImage && _bytes != null) {
      return InteractiveViewer(
        minScale: 0.5,
        maxScale: 4.0,
        child: Center(
          child: Image.memory(_bytes!, fit: BoxFit.contain),
        ),
      );
    }

    // PDF ready state (also opened automatically via native PDF viewer)
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppColors.border),
            boxShadow: const [BoxShadow(color: AppColors.shadowLight, blurRadius: 12, offset: Offset(0, 4))],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  color: AppColors.redBox,
                  borderRadius: BorderRadius.circular(18),
                ),
                child: const Icon(Icons.picture_as_pdf_rounded, color: AppColors.redText, size: 34),
              ),
              const SizedBox(height: 16),
              Text(
                doc.originalFilename,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                '${doc.sectionName} • ${doc.formattedSize}${doc.date.isNotEmpty ? ' • ${doc.date}' : ''}',
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 12.5),
              ),
              const SizedBox(height: 10),
              StatusBadge.fromStatus(doc.status),
              const SizedBox(height: 22),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _openingExternal ? null : _openExternally,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  icon: const Icon(Icons.picture_as_pdf_rounded),
                  label: Text(
                    _openingExternal ? 'Wird geöffnet...' : 'PDF öffnen',
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
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
