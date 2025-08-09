import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  History,
  Download,
  Calendar,
  Search,
  Trash2,
  Eye,
  Filter,
  BarChart3,
  Clock,
  FileText,
  Target,
  TrendingUp,
  Star,
  Edit3,
  Copy,
  ChevronDown,
  ChevronUp} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useExportState } from '@/store/app-store';
import type { ExportRecord } from '@/lib/tauri-api';

interface LocalExportRecord {
  id: string;
  filename: string;
  type: 'csv' | 'txt' | 'json';
  size: number;
  createdAt: Date;
  originalText: string;
  correctedText?: string;
  wordCount: number;
  errorCount?: number;
  ocrEngine?: string;
  ocrConfidence?: number;
  processingTime?: number;
  sourceType?: string;
  tags?: string[];
  isStarred?: boolean;
  notes?: string;
  exportPath?: string;
}

export function ExportHistoryPanel() {
  const { exportHistory, setExportHistory } = useExportState();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'csv' | 'txt' | 'json'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'single' | 'batch'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'size' | 'errors' | 'confidence'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedRecord, setSelectedRecord] = useState<LocalExportRecord | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [minConfidence, setMinConfidence] = useState(0);
  const [maxErrors, setMaxErrors] = useState(1000);
  const [showStatistics, setShowStatistics] = useState(false);
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());

  // Convert export history to display format
  const convertToDisplayRecord = (record: ExportRecord, index: number): LocalExportRecord => {
    const wordCount = record.original_text.split(/\s+/).filter(word => word.length > 0).length;
    
    return {
      id: `${record.timestamp}-${index}`,
      filename: `export_${new Date(record.timestamp).toISOString().split('T')[0]}_${index + 1}.csv`,
      type: 'csv',
      size: record.original_text.length + record.corrected_text.length,
      createdAt: new Date(record.timestamp),
      originalText: record.original_text,
      correctedText: record.corrected_text,
      wordCount,
      errorCount: record.grammar_error_count,
      ocrEngine: record.ocr_engine,
      ocrConfidence: record.ocr_confidence,
      processingTime: record.processing_time,
      sourceType: record.source_type,
      tags: [],
      isStarred: false,
      notes: '',
    };
  };

  // Load persisted metadata from localStorage
  useEffect(() => {
    const savedMetadata = localStorage.getItem('export-metadata');
    if (savedMetadata) {
      try {
        // Apply metadata to records
        // This would merge saved tags, stars, notes etc.
      } catch (error) {
        console.warn('Failed to load export metadata:', error);
      }
    }
  }, []);

  const allRecords = exportHistory.map(convertToDisplayRecord);

  const filteredAndSortedRecords = useMemo(() => {
    let filtered = allRecords.filter(record => {
      const matchesSearch = record.filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           record.originalText.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           record.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           record.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesType = filterType === 'all' || record.type === filterType;
      
      const matchesSource = sourceFilter === 'all' || 
                           (sourceFilter === 'single' && record.sourceType !== 'Batch Processing') ||
                           (sourceFilter === 'batch' && record.sourceType === 'Batch Processing');
      
      const matchesDateRange = !dateRange.start || !dateRange.end || 
                              (record.createdAt >= new Date(dateRange.start) && 
                               record.createdAt <= new Date(dateRange.end));
      
      const matchesConfidence = !record.ocrConfidence || record.ocrConfidence >= minConfidence / 100;
      
      const matchesErrors = !record.errorCount || record.errorCount <= maxErrors;
      
      return matchesSearch && matchesType && matchesSource && matchesDateRange && matchesConfidence && matchesErrors;
    });

    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'date':
          comparison = a.createdAt.getTime() - b.createdAt.getTime();
          break;
        case 'name':
          comparison = a.filename.localeCompare(b.filename);
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'errors':
          comparison = (a.errorCount || 0) - (b.errorCount || 0);
          break;
        case 'confidence':
          comparison = (a.ocrConfidence || 0) - (b.ocrConfidence || 0);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Sort starred items to the top if applicable
    filtered = filtered.sort((a, b) => {
      if (a.isStarred && !b.isStarred) return -1;
      if (!a.isStarred && b.isStarred) return 1;
      return 0;
    });

    return filtered;
  }, [allRecords, searchTerm, filterType, sourceFilter, sortBy, sortOrder, dateRange, minConfidence, maxErrors]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'csv':
        return '📊';
      case 'txt':
        return '📄';
      case 'json':
        return '🔧';
      default:
        return '📁';
    }
  };

  // Enhanced utility functions
  const toggleStarRecord = (recordId: string) => {
    // In a real implementation, this would update the metadata in localStorage
    console.log('Toggling star for record:', recordId);
  };


  const updateRecordNotes = (recordId: string, notes: string) => {
    // In a real implementation, this would update the metadata in localStorage
    console.log('Updating notes for record:', recordId, notes);
  };

  const toggleRecordSelection = (recordId: string) => {
    setSelectedRecords(prev => {
      const newSet = new Set(prev);
      if (newSet.has(recordId)) {
        newSet.delete(recordId);
      } else {
        newSet.add(recordId);
      }
      return newSet;
    });
  };

  const selectAllRecords = () => {
    setSelectedRecords(new Set(filteredAndSortedRecords.map(r => r.id)));
  };

  const clearSelection = () => {
    setSelectedRecords(new Set());
  };

  const downloadRecord = async (record: LocalExportRecord) => {
    try {
      // Create CSV content for the single record
      const csvContent = `Timestamp,OriginalText,CorrectedText,GrammarErrorCount,OCREngine,OCRConfidence,ProcessingTime,SourceType,ErrorSummary\\n${record.createdAt.toISOString()},"${record.originalText.replace(/"/g, '""')}","${record.correctedText?.replace(/"/g, '""') || ''}","${record.errorCount || 0}","${record.ocrEngine || 'Unknown'}","${record.ocrConfidence || 0}","${record.processingTime || 0}","${record.sourceType || 'Unknown'}",""`;
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', record.filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log('Downloaded:', record.filename);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const deleteRecord = (recordId: string) => {
    // Remove from export history
    const updatedHistory = exportHistory.filter((_, index) => 
      `${exportHistory[index].timestamp}-${index}` !== recordId
    );
    setExportHistory(updatedHistory);
    setSelectedRecords(prev => {
      const newSet = new Set(prev);
      newSet.delete(recordId);
      return newSet;
    });
  };

  const bulkDeleteRecords = () => {
    const recordsToDelete = Array.from(selectedRecords);
    recordsToDelete.forEach(deleteRecord);
    clearSelection();
  };

  const exportSelectedRecords = async () => {
    const recordsToExport = filteredAndSortedRecords.filter(r => selectedRecords.has(r.id));
    if (recordsToExport.length === 0) return;

    try {
      const csvContent = [
        'Timestamp,Filename,OriginalText,CorrectedText,GrammarErrorCount,OCREngine,OCRConfidence,ProcessingTime,SourceType,WordCount,FileSize',
        ...recordsToExport.map(record => 
          `"${record.createdAt.toISOString()}","${record.filename}","${record.originalText.replace(/"/g, '""')}","${record.correctedText?.replace(/"/g, '""') || ''}","${record.errorCount || 0}","${record.ocrEngine || 'Unknown'}","${record.ocrConfidence || 0}","${record.processingTime || 0}","${record.sourceType || 'Unknown'}","${record.wordCount}","${record.size}"`
        )
      ].join('\\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `export_history_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      clearSelection();
    } catch (error) {
      console.error('Bulk export failed:', error);
    }
  };

  const previewRecord = (record: LocalExportRecord) => {
    setSelectedRecord(record);
  };

  // Calculate statistics
  const statistics = useMemo(() => {
    const records = filteredAndSortedRecords;
    return {
      totalRecords: records.length,
      totalWords: records.reduce((sum, r) => sum + r.wordCount, 0),
      totalErrors: records.reduce((sum, r) => sum + (r.errorCount || 0), 0),
      avgConfidence: records.filter(r => r.ocrConfidence).length > 0 
        ? records.reduce((sum, r) => sum + (r.ocrConfidence || 0), 0) / records.filter(r => r.ocrConfidence).length
        : 0,
      avgProcessingTime: records.filter(r => r.processingTime).length > 0
        ? records.reduce((sum, r) => sum + (r.processingTime || 0), 0) / records.filter(r => r.processingTime).length
        : 0,
      engineStats: records.reduce((acc, r) => {
        if (r.ocrEngine) {
          acc[r.ocrEngine] = (acc[r.ocrEngine] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>),
      sourceStats: records.reduce((acc, r) => {
        if (r.sourceType) {
          acc[r.sourceType] = (acc[r.sourceType] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>),
    };
  }, [filteredAndSortedRecords]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Export History
              <span className="text-sm font-normal text-muted-foreground">
                ({statistics.totalRecords} records)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setShowStatistics(!showStatistics)}
                size="sm"
                variant="outline"
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                Statistics
              </Button>
              <Button
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                size="sm"
                variant="outline"
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
                {showAdvancedFilters ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Statistics Panel */}
          <AnimatePresence>
            {showStatistics && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="border rounded-lg p-4 space-y-4"
              >
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  <span className="font-medium">Export Statistics</span>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{statistics.totalRecords}</div>
                    <div className="text-sm text-muted-foreground">Total Records</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{statistics.totalWords.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">Total Words</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{statistics.totalErrors}</div>
                    <div className="text-sm text-muted-foreground">Total Errors</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">{(statistics.avgConfidence * 100).toFixed(1)}%</div>
                    <div className="text-sm text-muted-foreground">Avg Confidence</div>
                  </div>
                </div>

                {Object.keys(statistics.engineStats).length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium">OCR Engines Used</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(statistics.engineStats).map(([engine, count]) => (
                        <span key={engine} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-xs">
                          {engine}: {count}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Basic Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search exports, tags, notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-md"
              />
            </div>
            
            <div className="flex gap-2">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="px-3 py-2 border rounded-md"
              >
                <option value="all">All Types</option>
                <option value="csv">CSV</option>
                <option value="txt">Text</option>
                <option value="json">JSON</option>
              </select>
              
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as any)}
                className="px-3 py-2 border rounded-md"
              >
                <option value="all">All Sources</option>
                <option value="single">Single Files</option>
                <option value="batch">Batch Processing</option>
              </select>
              
              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [field, order] = e.target.value.split('-');
                  setSortBy(field as any);
                  setSortOrder(order as any);
                }}
                className="px-3 py-2 border rounded-md"
              >
                <option value="date-desc">Newest First</option>
                <option value="date-asc">Oldest First</option>
                <option value="name-asc">Name A-Z</option>
                <option value="name-desc">Name Z-A</option>
                <option value="size-desc">Largest First</option>
                <option value="size-asc">Smallest First</option>
                <option value="errors-asc">Fewest Errors</option>
                <option value="errors-desc">Most Errors</option>
                <option value="confidence-desc">Highest Confidence</option>
                <option value="confidence-asc">Lowest Confidence</option>
              </select>
            </div>
          </div>

          {/* Advanced Filters */}
          <AnimatePresence>
            {showAdvancedFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="border rounded-lg p-4 space-y-4"
              >
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <span className="font-medium">Advanced Filters</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Date Range</label>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={dateRange.start}
                        onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                        className="flex-1 px-3 py-1.5 text-sm border rounded-md"
                      />
                      <input
                        type="date"
                        value={dateRange.end}
                        onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                        className="flex-1 px-3 py-1.5 text-sm border rounded-md"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Min OCR Confidence (%)</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={minConfidence}
                      onChange={(e) => setMinConfidence(parseInt(e.target.value))}
                      className="w-full"
                    />
                    <div className="text-xs text-muted-foreground">{minConfidence}%</div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Max Grammar Errors</label>
                    <input
                      type="number"
                      min="0"
                      value={maxErrors}
                      onChange={(e) => setMaxErrors(parseInt(e.target.value) || 1000)}
                      className="w-full px-3 py-1.5 text-sm border rounded-md"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bulk Actions */}
          {selectedRecords.size > 0 && (
            <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <span className="text-sm font-medium">
                {selectedRecords.size} record(s) selected
              </span>
              <div className="flex gap-2">
                <Button onClick={exportSelectedRecords} size="sm" variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Export Selected
                </Button>
                <Button onClick={bulkDeleteRecords} size="sm" variant="outline">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Selected
                </Button>
                <Button onClick={clearSelection} size="sm" variant="ghost">
                  Clear Selection
                </Button>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <Button onClick={selectAllRecords} size="sm" variant="outline">
              Select All
            </Button>
            <Button onClick={clearSelection} size="sm" variant="outline" disabled={selectedRecords.size === 0}>
              Clear Selection
            </Button>
            <div className="text-sm text-muted-foreground ml-auto">
              Showing {filteredAndSortedRecords.length} of {allRecords.length} records
            </div>
          </div>

          {/* Export List */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            <AnimatePresence>
              {filteredAndSortedRecords.map((record) => (
                <motion.div
                  key={record.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className={`border rounded-lg p-4 hover:bg-muted/50 transition-colors ${
                    selectedRecords.has(record.id) ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800' : ''
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedRecords.has(record.id)}
                        onChange={() => toggleRecordSelection(record.id)}
                        className="rounded"
                      />
                      <div className="text-2xl">{getTypeIcon(record.type)}</div>
                    </div>
                    
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium truncate">{record.filename}</h4>
                        {record.isStarred && (
                          <Star className="h-4 w-4 text-yellow-500 fill-current" />
                        )}
                        <div className="flex gap-1">
                          {record.tags?.map(tag => (
                            <span key={tag} className="inline-flex items-center px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded text-xs">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(record.createdAt)}
                        </div>
                        <div className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {formatFileSize(record.size)} • {record.wordCount} words
                        </div>
                        {record.errorCount !== undefined && (
                          <div className="flex items-center gap-1">
                            <Target className="h-3 w-3" />
                            {record.errorCount} errors
                          </div>
                        )}
                        {record.ocrConfidence && (
                          <div className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            {(record.ocrConfidence * 100).toFixed(1)}% confidence
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {record.ocrEngine && (
                          <span className="flex items-center gap-1">
                            Engine: {record.ocrEngine}
                          </span>
                        )}
                        {record.processingTime && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {record.processingTime.toFixed(2)}s
                          </span>
                        )}
                        {record.sourceType && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                            {record.sourceType}
                          </span>
                        )}
                      </div>

                      {record.notes && (
                        <div className="text-sm text-gray-600 dark:text-gray-400 italic">
                          "{record.notes}"
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleStarRecord(record.id)}
                        title={record.isStarred ? "Remove from favorites" : "Add to favorites"}
                      >
                        <Star className={`h-4 w-4 ${record.isStarred ? 'text-yellow-500 fill-current' : ''}`} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => previewRecord(record)}
                        title="Preview"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => downloadRecord(record)}
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteRecord(record.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {filteredAndSortedRecords.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No export records found</p>
              <p className="text-sm">
                {searchTerm || filterType !== 'all' 
                  ? 'Try adjusting your search or filters'
                  : 'Export some documents to see them here'
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enhanced Preview Modal */}
      <AnimatePresence>
        {selectedRecord && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedRecord(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-background border rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-4 border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      {selectedRecord.filename}
                      {selectedRecord.isStarred && (
                        <Star className="h-4 w-4 text-yellow-500 fill-current" />
                      )}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                      <span>{formatDate(selectedRecord.createdAt)}</span>
                      <span>{formatFileSize(selectedRecord.size)}</span>
                      <span>{selectedRecord.wordCount} words</span>
                      {selectedRecord.errorCount !== undefined && (
                        <span>{selectedRecord.errorCount} errors</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleStarRecord(selectedRecord.id)}
                    >
                      <Star className={`h-4 w-4 ${selectedRecord.isStarred ? 'text-yellow-500 fill-current' : ''}`} />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadRecord(selectedRecord)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Metadata */}
              <div className="p-4 border-b bg-muted/50">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  {selectedRecord.ocrEngine && (
                    <div>
                      <div className="font-medium text-muted-foreground">OCR Engine</div>
                      <div>{selectedRecord.ocrEngine}</div>
                    </div>
                  )}
                  {selectedRecord.ocrConfidence && (
                    <div>
                      <div className="font-medium text-muted-foreground">Confidence</div>
                      <div>{(selectedRecord.ocrConfidence * 100).toFixed(1)}%</div>
                    </div>
                  )}
                  {selectedRecord.processingTime && (
                    <div>
                      <div className="font-medium text-muted-foreground">Processing Time</div>
                      <div>{selectedRecord.processingTime.toFixed(2)}s</div>
                    </div>
                  )}
                  {selectedRecord.sourceType && (
                    <div>
                      <div className="font-medium text-muted-foreground">Source</div>
                      <div>{selectedRecord.sourceType}</div>
                    </div>
                  )}
                </div>
                
                {selectedRecord.tags && selectedRecord.tags.length > 0 && (
                  <div className="mt-3">
                    <div className="font-medium text-muted-foreground mb-1">Tags</div>
                    <div className="flex flex-wrap gap-1">
                      {selectedRecord.tags.map(tag => (
                        <span key={tag} className="inline-flex items-center px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-xs">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Content */}
              <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 300px)' }}>
                <div className="space-y-6">
                  {/* Original Text */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">Original Text</h4>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => navigator.clipboard.writeText(selectedRecord.originalText)}
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        Copy
                      </Button>
                    </div>
                    <div className="p-3 bg-muted rounded border text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {selectedRecord.originalText}
                    </div>
                  </div>
                  
                  {/* Corrected Text */}
                  {selectedRecord.correctedText && selectedRecord.correctedText !== selectedRecord.originalText && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">Corrected Text</h4>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => navigator.clipboard.writeText(selectedRecord.correctedText!)}
                        >
                          <Copy className="h-4 w-4 mr-1" />
                          Copy
                        </Button>
                      </div>
                      <div className="p-3 bg-green-50 dark:bg-green-950 rounded border text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {selectedRecord.correctedText}
                      </div>
                    </div>
                  )}

                  {/* Notes Section */}
                  <div>
                    <h4 className="font-medium mb-2">Notes</h4>
                    <textarea
                      value={selectedRecord.notes || ''}
                      onChange={(e) => updateRecordNotes(selectedRecord.id, e.target.value)}
                      placeholder="Add your notes about this export..."
                      className="w-full p-3 border rounded-md text-sm"
                      rows={3}
                    />
                  </div>
                </div>
              </div>
              
              {/* Footer */}
              <div className="p-4 border-t flex justify-between">
                <Button variant="outline" onClick={() => setSelectedRecord(null)}>
                  Close
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => downloadRecord(selectedRecord)}>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                  <Button onClick={() => setSelectedRecord(null)}>
                    <Edit3 className="h-4 w-4 mr-2" />
                    Open in Editor
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
