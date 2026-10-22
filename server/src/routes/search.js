import { Router } from 'express';
import { AppError } from '../utils/AppError.js';
import { validate } from '../middleware/validate.js';
import { searchQuerySchema, suggestionQuerySchema } from '../validators/search.js';
import * as searchRepository from '../repositories/searchRepository.js';

function resultDto(row) {
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    topic: row.topic,
    subtopic: row.subtopic,
    description: row.description,
    originalFilename: row.original_filename,
    fileExtension: row.file_extension,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    tags: row.tags || [],
    documentName: row.title,
    fieldDiscipline: row.field_discipline,
    courseProgram: row.course_program,
    semesterStudyYear: row.semester_study_year,
    unitTopic: row.topic,
    documentType: row.document_type,
    academicYear: row.academic_year,
    collegeUniversity: row.college_university,
    tagsKeywords: row.tags || [],
    status: row.status,
    downloadCount: row.download_count,
    createdAt: row.created_at,
    uploaderName: row.uploader_name,
    score: row.score,
  };
}

function suggestionDto(row) {
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    fileExtension: row.file_extension,
    uploaderName: row.uploader_name,
    score: row.score,
  };
}

export function createSearchRouter({ limiters, authenticate }) {
  const router = Router();
  router.use(limiters.search, authenticate);

  router.get('/suggestions', validate(suggestionQuerySchema, 'query'), async (req, res) => {
    const { q, limit } = req.valid.query;
    const result = await searchRepository.suggest(req.auth.db, { p_query: q, p_limit: limit });
    if (result.error) throw new Error(`document suggestions failed: ${result.error.message}`);
    res.json({ suggestions: (result.data || []).map(suggestionDto) });
  });

  router.get('/', validate(searchQuerySchema, 'query'), async (req, res) => {
    const { q, subject, topic, fileType, from, to, sort, page, limit, fieldDiscipline, courseProgram, semesterStudyYear, documentType, academicYear, collegeUniversity, tagsKeyword } = req.valid.query;
    const result = await searchRepository.search(req.auth.db, {
      p_query: q,
      p_subject: subject || null,
      p_topic: topic || null,
      p_file_ext: fileType || null,
      p_from: from || null,
      p_to: to || null,
      p_sort: sort,
      p_limit: limit,
      p_offset: (page - 1) * limit,
      p_field_discipline: fieldDiscipline || null,
      p_course_program: courseProgram || null,
      p_semester_study_year: semesterStudyYear || null,
      p_document_type: documentType || null,
      p_academic_year: academicYear || null,
      p_college_university: collegeUniversity || null,
      p_tags_keyword: tagsKeyword || null,
    });
    if (result.error) throw new Error(`document search failed: ${result.error.message}`);
    const rows = result.data || [];
    res.json({
      documents: rows.map(resultDto),
      pagination: {
        page,
        limit,
        total: Number(rows[0]?.total_count || 0),
        totalPages: Math.ceil(Number(rows[0]?.total_count || 0) / limit),
      },
    });
  });

  return router;
}

export { resultDto, suggestionDto };
