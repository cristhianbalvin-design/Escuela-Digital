export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      assessments: {
        Row: {
          created_at: string
          id: string
          instructions: string
          settings: Json
          tenant_id: string
          title: string
          updated_at: string
          version_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instructions?: string
          settings?: Json
          tenant_id: string
          title: string
          updated_at?: string
          version_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instructions?: string
          settings?: Json
          tenant_id?: string
          title?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_version_fk"
            columns: ["tenant_id", "version_id"]
            isOneToOne: false
            referencedRelation: "course_versions"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      assignments: {
        Row: {
          allow_late: boolean
          created_at: string
          due_at: string | null
          id: string
          instructions: string
          late_penalty_pct: number
          max_score: number
          rubric_id: string | null
          submission_types: string[]
          tenant_id: string
          title: string
          updated_at: string
          version_id: string
        }
        Insert: {
          allow_late?: boolean
          created_at?: string
          due_at?: string | null
          id?: string
          instructions?: string
          late_penalty_pct?: number
          max_score?: number
          rubric_id?: string | null
          submission_types?: string[]
          tenant_id: string
          title: string
          updated_at?: string
          version_id: string
        }
        Update: {
          allow_late?: boolean
          created_at?: string
          due_at?: string | null
          id?: string
          instructions?: string
          late_penalty_pct?: number
          max_score?: number
          rubric_id?: string | null
          submission_types?: string[]
          tenant_id?: string
          title?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_rubric_fk"
            columns: ["tenant_id", "version_id", "rubric_id"]
            isOneToOne: false
            referencedRelation: "rubrics"
            referencedColumns: ["tenant_id", "version_id", "id"]
          },
          {
            foreignKeyName: "assignments_version_fk"
            columns: ["tenant_id", "version_id"]
            isOneToOne: false
            referencedRelation: "course_versions"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      attempt_answers: {
        Row: {
          answer: Json | null
          attempt_id: string
          created_at: string
          feedback: string | null
          graded_at: string | null
          graded_by: string | null
          question_id: string
          score: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          answer?: Json | null
          attempt_id: string
          created_at?: string
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          question_id: string
          score?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          answer?: Json | null
          attempt_id?: string
          created_at?: string
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          question_id?: string
          score?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attempt_answers_attempt_fk"
            columns: ["tenant_id", "attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "attempt_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      attempts: {
        Row: {
          assessment_id: string
          attempt_no: number
          client_id: string
          created_at: string
          deadline_at: string | null
          enrollment_id: string
          id: string
          max_score: number | null
          score: number | null
          seed: string
          started_at: string
          status: Database["public"]["Enums"]["attempt_status"]
          submitted_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assessment_id: string
          attempt_no: number
          client_id: string
          created_at?: string
          deadline_at?: string | null
          enrollment_id: string
          id?: string
          max_score?: number | null
          score?: number | null
          seed?: string
          started_at?: string
          status?: Database["public"]["Enums"]["attempt_status"]
          submitted_at?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          attempt_no?: number
          client_id?: string
          created_at?: string
          deadline_at?: string | null
          enrollment_id?: string
          id?: string
          max_score?: number | null
          score?: number | null
          seed?: string
          started_at?: string
          status?: Database["public"]["Enums"]["attempt_status"]
          submitted_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attempts_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempts_enrollment_fk"
            columns: ["tenant_id", "client_id", "enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["tenant_id", "client_id", "id"]
          },
        ]
      }
      certificate_events: {
        Row: {
          actor_id: string | null
          certificate_id: string
          created_at: string
          id: string
          reason: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["certificate_event_type"]
        }
        Insert: {
          actor_id?: string | null
          certificate_id: string
          created_at?: string
          id?: string
          reason?: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["certificate_event_type"]
        }
        Update: {
          actor_id?: string | null
          certificate_id?: string
          created_at?: string
          id?: string
          reason?: string | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["certificate_event_type"]
        }
        Relationships: [
          {
            foreignKeyName: "certificate_events_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_signers: {
        Row: {
          created_at: string
          deleted_at: string | null
          full_name: string
          id: string
          signature_path: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          full_name: string
          id?: string
          signature_path?: string | null
          tenant_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          full_name?: string
          id?: string
          signature_path?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificate_signers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          client_id: string
          code: string
          course_title: string
          created_at: string
          created_by: string | null
          enrollment_id: string
          grade: number | null
          hours: number | null
          id: string
          instructor_name: string | null
          issued_at: string
          issuer_mode: Database["public"]["Enums"]["issuer_mode"]
          issuer_snapshot: Json
          last_render_error: string | null
          offering_id: string
          pdf_path: string | null
          render_attempts: number
          rendered_at: string | null
          replaced_by: string | null
          revoked_at: string | null
          revoked_by: string | null
          revoked_reason: string | null
          status: Database["public"]["Enums"]["certificate_status"]
          student_name: string
          template_snapshot: Json
          tenant_id: string
          updated_at: string
          user_id: string
          version_id: string
        }
        Insert: {
          client_id: string
          code: string
          course_title: string
          created_at?: string
          created_by?: string | null
          enrollment_id: string
          grade?: number | null
          hours?: number | null
          id?: string
          instructor_name?: string | null
          issued_at?: string
          issuer_mode: Database["public"]["Enums"]["issuer_mode"]
          issuer_snapshot?: Json
          last_render_error?: string | null
          offering_id: string
          pdf_path?: string | null
          render_attempts?: number
          rendered_at?: string | null
          replaced_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          status?: Database["public"]["Enums"]["certificate_status"]
          student_name: string
          template_snapshot?: Json
          tenant_id: string
          updated_at?: string
          user_id: string
          version_id: string
        }
        Update: {
          client_id?: string
          code?: string
          course_title?: string
          created_at?: string
          created_by?: string | null
          enrollment_id?: string
          grade?: number | null
          hours?: number | null
          id?: string
          instructor_name?: string | null
          issued_at?: string
          issuer_mode?: Database["public"]["Enums"]["issuer_mode"]
          issuer_snapshot?: Json
          last_render_error?: string | null
          offering_id?: string
          pdf_path?: string | null
          render_attempts?: number
          rendered_at?: string | null
          replaced_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          status?: Database["public"]["Enums"]["certificate_status"]
          student_name?: string
          template_snapshot?: Json
          tenant_id?: string
          updated_at?: string
          user_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_enrollment_fk"
            columns: ["tenant_id", "client_id", "enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["tenant_id", "client_id", "id"]
          },
          {
            foreignKeyName: "certificates_offering_fk"
            columns: ["tenant_id", "client_id", "offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["tenant_id", "client_id", "id"]
          },
          {
            foreignKeyName: "certificates_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["id"]
          },
        ]
      }
      client_members: {
        Row: {
          client_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["client_member_role"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["client_member_role"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["client_member_role"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_members_client_fk"
            columns: ["tenant_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "client_members_tenant_member_fk"
            columns: ["tenant_id", "user_id"]
            isOneToOne: false
            referencedRelation: "tenant_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          slug: string
          status: Database["public"]["Enums"]["client_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          slug: string
          status?: Database["public"]["Enums"]["client_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          slug?: string
          status?: Database["public"]["Enums"]["client_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      course_collaborators: {
        Row: {
          course_id: string
          created_at: string
          role: Database["public"]["Enums"]["course_collaborator_role"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          role: Database["public"]["Enums"]["course_collaborator_role"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          role?: Database["public"]["Enums"]["course_collaborator_role"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_collaborators_course_fk"
            columns: ["tenant_id", "course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "course_collaborators_member_fk"
            columns: ["tenant_id", "user_id"]
            isOneToOne: false
            referencedRelation: "tenant_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
        ]
      }
      course_versions: {
        Row: {
          completion_defaults: Json
          course_id: string
          created_at: string
          hours: number | null
          id: string
          published_at: string | null
          published_by: string | null
          source_tenant_id: string | null
          source_version_id: string | null
          status: Database["public"]["Enums"]["course_version_status"]
          summary: string | null
          tenant_id: string
          title: string
          updated_at: string
          version_number: number
        }
        Insert: {
          completion_defaults?: Json
          course_id: string
          created_at?: string
          hours?: number | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          source_tenant_id?: string | null
          source_version_id?: string | null
          status?: Database["public"]["Enums"]["course_version_status"]
          summary?: string | null
          tenant_id: string
          title: string
          updated_at?: string
          version_number: number
        }
        Update: {
          completion_defaults?: Json
          course_id?: string
          created_at?: string
          hours?: number | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          source_tenant_id?: string | null
          source_version_id?: string | null
          status?: Database["public"]["Enums"]["course_version_status"]
          summary?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_versions_course_fk"
            columns: ["tenant_id", "course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "course_versions_source_fk"
            columns: ["source_tenant_id", "source_version_id"]
            isOneToOne: false
            referencedRelation: "course_versions"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      courses: {
        Row: {
          category: string | null
          cover_path: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          language: string
          latest_published_version_id: string | null
          level: string | null
          slug: string
          status: Database["public"]["Enums"]["course_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          cover_path?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          id?: string
          language?: string
          latest_published_version_id?: string | null
          level?: string | null
          slug: string
          status?: Database["public"]["Enums"]["course_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          cover_path?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          language?: string
          latest_published_version_id?: string | null
          level?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["course_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_latest_published_fk"
            columns: ["tenant_id", "id", "latest_published_version_id"]
            isOneToOne: false
            referencedRelation: "course_versions"
            referencedColumns: ["tenant_id", "course_id", "id"]
          },
          {
            foreignKeyName: "courses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          client_id: string
          completed_at: string | null
          created_at: string
          enrolled_at: string
          final_grade: number | null
          id: string
          last_activity_at: string | null
          offering_id: string
          progress_pct: number
          risk_level:
            Database["public"]["Enums"]["enrollment_risk_level"] | null
          status: Database["public"]["Enums"]["enrollment_status"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          completed_at?: string | null
          created_at?: string
          enrolled_at?: string
          final_grade?: number | null
          id?: string
          last_activity_at?: string | null
          offering_id: string
          progress_pct?: number
          risk_level?:
            Database["public"]["Enums"]["enrollment_risk_level"] | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          completed_at?: string | null
          created_at?: string
          enrolled_at?: string
          final_grade?: number | null
          id?: string
          last_activity_at?: string | null
          offering_id?: string
          progress_pct?: number
          risk_level?:
            Database["public"]["Enums"]["enrollment_risk_level"] | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_client_member_fk"
            columns: ["tenant_id", "client_id", "user_id"]
            isOneToOne: false
            referencedRelation: "client_members"
            referencedColumns: ["tenant_id", "client_id", "user_id"]
          },
          {
            foreignKeyName: "enrollments_member_fk"
            columns: ["tenant_id", "user_id"]
            isOneToOne: false
            referencedRelation: "tenant_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "enrollments_offering_fk"
            columns: ["tenant_id", "client_id", "offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["tenant_id", "client_id", "id"]
          },
        ]
      }
      grade_items: {
        Row: {
          created_at: string
          id: string
          max_score: number | null
          source_id: string | null
          source_type: Database["public"]["Enums"]["grade_source_type"]
          tenant_id: string
          title: string
          updated_at: string
          version_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          max_score?: number | null
          source_id?: string | null
          source_type: Database["public"]["Enums"]["grade_source_type"]
          tenant_id: string
          title: string
          updated_at?: string
          version_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          id?: string
          max_score?: number | null
          source_id?: string | null
          source_type?: Database["public"]["Enums"]["grade_source_type"]
          tenant_id?: string
          title?: string
          updated_at?: string
          version_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "grade_items_version_fk"
            columns: ["tenant_id", "version_id"]
            isOneToOne: false
            referencedRelation: "course_versions"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      grades: {
        Row: {
          adjusted_reason: string | null
          client_id: string
          comment: string | null
          created_at: string
          enrollment_id: string
          grade_item_id: string
          graded_at: string
          graded_by: string | null
          max_score: number
          score: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          adjusted_reason?: string | null
          client_id: string
          comment?: string | null
          created_at?: string
          enrollment_id: string
          grade_item_id: string
          graded_at?: string
          graded_by?: string | null
          max_score: number
          score: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          adjusted_reason?: string | null
          client_id?: string
          comment?: string | null
          created_at?: string
          enrollment_id?: string
          grade_item_id?: string
          graded_at?: string
          graded_by?: string | null
          max_score?: number
          score?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grades_enrollment_fk"
            columns: ["tenant_id", "client_id", "enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["tenant_id", "client_id", "id"]
          },
          {
            foreignKeyName: "grades_grade_item_id_fkey"
            columns: ["grade_item_id"]
            isOneToOne: false
            referencedRelation: "grade_items"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          client_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          offering_id: string | null
          role: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          client_id?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          offering_id?: string | null
          role: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          client_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          offering_id?: string | null
          role?: Database["public"]["Enums"]["tenant_role"]
          tenant_id?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_client_fk"
            columns: ["tenant_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "invitations_offering_fk"
            columns: ["tenant_id", "offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          client_id: string
          completed_at: string | null
          created_at: string
          enrollment_id: string
          last_position_seconds: number
          lesson_id: string
          status: Database["public"]["Enums"]["lesson_progress_status"]
          tenant_id: string
          time_spent_seconds: number
          updated_at: string
        }
        Insert: {
          client_id: string
          completed_at?: string | null
          created_at?: string
          enrollment_id: string
          last_position_seconds?: number
          lesson_id: string
          status?: Database["public"]["Enums"]["lesson_progress_status"]
          tenant_id: string
          time_spent_seconds?: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          completed_at?: string | null
          created_at?: string
          enrollment_id?: string
          last_position_seconds?: number
          lesson_id?: string
          status?: Database["public"]["Enums"]["lesson_progress_status"]
          tenant_id?: string
          time_spent_seconds?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_enrollment_fk"
            columns: ["tenant_id", "client_id", "enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["tenant_id", "client_id", "id"]
          },
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_resources: {
        Row: {
          audience: string
          id: string
          kind: string
          lesson_id: string
          name: string
          size_bytes: number | null
          storage_path: string
          tenant_id: string
          version_id: string
        }
        Insert: {
          audience?: string
          id?: string
          kind: string
          lesson_id: string
          name: string
          size_bytes?: number | null
          storage_path: string
          tenant_id: string
          version_id: string
        }
        Update: {
          audience?: string
          id?: string
          kind?: string
          lesson_id?: string
          name?: string
          size_bytes?: number | null
          storage_path?: string
          tenant_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_resources_lesson_fk"
            columns: ["tenant_id", "version_id", "lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["tenant_id", "version_id", "id"]
          },
        ]
      }
      lessons: {
        Row: {
          content: Json
          est_minutes: number | null
          id: string
          is_required: boolean
          module_id: string
          position: number
          tenant_id: string
          title: string
          type: Database["public"]["Enums"]["lesson_type"]
          version_id: string
        }
        Insert: {
          content?: Json
          est_minutes?: number | null
          id?: string
          is_required?: boolean
          module_id: string
          position: number
          tenant_id: string
          title: string
          type: Database["public"]["Enums"]["lesson_type"]
          version_id: string
        }
        Update: {
          content?: Json
          est_minutes?: number | null
          id?: string
          is_required?: boolean
          module_id?: string
          position?: number
          tenant_id?: string
          title?: string
          type?: Database["public"]["Enums"]["lesson_type"]
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_module_fk"
            columns: ["tenant_id", "version_id", "module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["tenant_id", "version_id", "id"]
          },
        ]
      }
      modules: {
        Row: {
          id: string
          position: number
          tenant_id: string
          title: string
          version_id: string
        }
        Insert: {
          id?: string
          position: number
          tenant_id: string
          title: string
          version_id: string
        }
        Update: {
          id?: string
          position?: number
          tenant_id?: string
          title?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "modules_version_fk"
            columns: ["tenant_id", "version_id"]
            isOneToOne: false
            referencedRelation: "course_versions"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      offering_instructors: {
        Row: {
          created_at: string
          offering_id: string
          role: Database["public"]["Enums"]["offering_instructor_role"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          offering_id: string
          role: Database["public"]["Enums"]["offering_instructor_role"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          offering_id?: string
          role?: Database["public"]["Enums"]["offering_instructor_role"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offering_instructors_member_fk"
            columns: ["tenant_id", "user_id"]
            isOneToOne: false
            referencedRelation: "tenant_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "offering_instructors_offering_fk"
            columns: ["tenant_id", "offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      offerings: {
        Row: {
          certificate_signer_ids: string[]
          certificate_template_id: string | null
          client_id: string
          code: string
          completion_rules: Json
          course_id: string
          created_at: string
          created_by: string
          deleted_at: string | null
          ends_at: string | null
          enrollment_mode: Database["public"]["Enums"]["enrollment_mode"]
          id: string
          issuer_mode: Database["public"]["Enums"]["issuer_mode"]
          join_code: string | null
          modality: Database["public"]["Enums"]["offering_modality"]
          release_schedule: Json
          seats: number | null
          starts_at: string | null
          status: Database["public"]["Enums"]["offering_status"]
          tenant_id: string
          timezone: string
          title: string
          updated_at: string
          version_id: string
        }
        Insert: {
          certificate_signer_ids?: string[]
          certificate_template_id?: string | null
          client_id: string
          code: string
          completion_rules?: Json
          course_id: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          ends_at?: string | null
          enrollment_mode: Database["public"]["Enums"]["enrollment_mode"]
          id?: string
          issuer_mode?: Database["public"]["Enums"]["issuer_mode"]
          join_code?: string | null
          modality: Database["public"]["Enums"]["offering_modality"]
          release_schedule?: Json
          seats?: number | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["offering_status"]
          tenant_id: string
          timezone?: string
          title: string
          updated_at?: string
          version_id: string
        }
        Update: {
          certificate_signer_ids?: string[]
          certificate_template_id?: string | null
          client_id?: string
          code?: string
          completion_rules?: Json
          course_id?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          ends_at?: string | null
          enrollment_mode?: Database["public"]["Enums"]["enrollment_mode"]
          id?: string
          issuer_mode?: Database["public"]["Enums"]["issuer_mode"]
          join_code?: string | null
          modality?: Database["public"]["Enums"]["offering_modality"]
          release_schedule?: Json
          seats?: number | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["offering_status"]
          tenant_id?: string
          timezone?: string
          title?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offerings_client_fk"
            columns: ["tenant_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "offerings_version_fk"
            columns: ["tenant_id", "course_id", "version_id"]
            isOneToOne: false
            referencedRelation: "course_versions"
            referencedColumns: ["tenant_id", "course_id", "id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      question_keys: {
        Row: {
          answer: Json
          created_at: string
          question_id: string
          tenant_id: string
          updated_at: string
          version_id: string
        }
        Insert: {
          answer: Json
          created_at?: string
          question_id: string
          tenant_id: string
          updated_at?: string
          version_id: string
        }
        Update: {
          answer?: Json
          created_at?: string
          question_id?: string
          tenant_id?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_keys_question_fk"
            columns: ["tenant_id", "version_id", "question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["tenant_id", "version_id", "id"]
          },
        ]
      }
      question_options: {
        Row: {
          created_at: string
          id: string
          label: string
          position: number
          question_id: string
          tenant_id: string
          updated_at: string
          version_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          position: number
          question_id: string
          tenant_id: string
          updated_at?: string
          version_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          position?: number
          question_id?: string
          tenant_id?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_options_question_fk"
            columns: ["tenant_id", "version_id", "question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["tenant_id", "version_id", "id"]
          },
        ]
      }
      questions: {
        Row: {
          assessment_id: string
          created_at: string
          feedback_bad: string | null
          feedback_ok: string | null
          id: string
          points: number
          position: number
          prompt: string
          tags: string[]
          tenant_id: string
          type: Database["public"]["Enums"]["question_type"]
          updated_at: string
          version_id: string
        }
        Insert: {
          assessment_id: string
          created_at?: string
          feedback_bad?: string | null
          feedback_ok?: string | null
          id?: string
          points?: number
          position: number
          prompt: string
          tags?: string[]
          tenant_id: string
          type: Database["public"]["Enums"]["question_type"]
          updated_at?: string
          version_id: string
        }
        Update: {
          assessment_id?: string
          created_at?: string
          feedback_bad?: string | null
          feedback_ok?: string | null
          id?: string
          points?: number
          position?: number
          prompt?: string
          tags?: string[]
          tenant_id?: string
          type?: Database["public"]["Enums"]["question_type"]
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_assessment_fk"
            columns: ["tenant_id", "version_id", "assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["tenant_id", "version_id", "id"]
          },
        ]
      }
      rubric_criteria: {
        Row: {
          created_at: string
          id: string
          position: number
          rubric_id: string
          tenant_id: string
          title: string
          updated_at: string
          version_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          position: number
          rubric_id: string
          tenant_id: string
          title: string
          updated_at?: string
          version_id: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          rubric_id?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rubric_criteria_rubric_fk"
            columns: ["tenant_id", "version_id", "rubric_id"]
            isOneToOne: false
            referencedRelation: "rubrics"
            referencedColumns: ["tenant_id", "version_id", "id"]
          },
        ]
      }
      rubric_levels: {
        Row: {
          created_at: string
          criterion_id: string
          descriptor: string
          id: string
          label: string
          points: number
          position: number
          tenant_id: string
          updated_at: string
          version_id: string
        }
        Insert: {
          created_at?: string
          criterion_id: string
          descriptor?: string
          id?: string
          label: string
          points: number
          position: number
          tenant_id: string
          updated_at?: string
          version_id: string
        }
        Update: {
          created_at?: string
          criterion_id?: string
          descriptor?: string
          id?: string
          label?: string
          points?: number
          position?: number
          tenant_id?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rubric_levels_criterion_fk"
            columns: ["tenant_id", "version_id", "criterion_id"]
            isOneToOne: false
            referencedRelation: "rubric_criteria"
            referencedColumns: ["tenant_id", "version_id", "id"]
          },
        ]
      }
      rubrics: {
        Row: {
          created_at: string
          id: string
          tenant_id: string
          title: string
          updated_at: string
          version_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tenant_id: string
          title: string
          updated_at?: string
          version_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rubrics_version_fk"
            columns: ["tenant_id", "version_id"]
            isOneToOne: false
            referencedRelation: "course_versions"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      submission_scores: {
        Row: {
          comment: string | null
          created_at: string
          criterion_id: string
          level_id: string
          points: number
          submission_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          criterion_id: string
          level_id: string
          points: number
          submission_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          criterion_id?: string
          level_id?: string
          points?: number
          submission_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_scores_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "rubric_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_scores_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "rubric_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_scores_submission_fk"
            columns: ["tenant_id", "submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      submissions: {
        Row: {
          assignment_id: string
          client_id: string
          created_at: string
          enrollment_id: string
          feedback: string | null
          files: Json
          graded_at: string | null
          graded_by: string | null
          id: string
          is_late: boolean
          link: string | null
          raw_score: number | null
          score: number | null
          status: Database["public"]["Enums"]["submission_status"]
          submitted_at: string
          tenant_id: string
          text: string | null
          updated_at: string
        }
        Insert: {
          assignment_id: string
          client_id: string
          created_at?: string
          enrollment_id: string
          feedback?: string | null
          files?: Json
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          is_late?: boolean
          link?: string | null
          raw_score?: number | null
          score?: number | null
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_at?: string
          tenant_id: string
          text?: string | null
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          client_id?: string
          created_at?: string
          enrollment_id?: string
          feedback?: string | null
          files?: Json
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          is_late?: boolean
          link?: string | null
          raw_score?: number | null
          score?: number | null
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_at?: string
          tenant_id?: string
          text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_enrollment_fk"
            columns: ["tenant_id", "client_id", "enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["tenant_id", "client_id", "id"]
          },
        ]
      }
      tenant_domains: {
        Row: {
          created_at: string
          host: string
          id: string
          is_primary: boolean
          kind: Database["public"]["Enums"]["domain_kind"]
          tenant_id: string
          updated_at: string
          verification: Json
          verified: boolean
        }
        Insert: {
          created_at?: string
          host: string
          id?: string
          is_primary?: boolean
          kind?: Database["public"]["Enums"]["domain_kind"]
          tenant_id: string
          updated_at?: string
          verification?: Json
          verified?: boolean
        }
        Update: {
          created_at?: string
          host?: string
          id?: string
          is_primary?: boolean
          kind?: Database["public"]["Enums"]["domain_kind"]
          tenant_id?: string
          updated_at?: string
          verification?: Json
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tenant_domains_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          can_author: boolean
          created_at: string
          invited_by: string | null
          role: Database["public"]["Enums"]["tenant_role"]
          status: Database["public"]["Enums"]["member_status"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_author?: boolean
          created_at?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["tenant_role"]
          status?: Database["public"]["Enums"]["member_status"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_author?: boolean
          created_at?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["tenant_role"]
          status?: Database["public"]["Enums"]["member_status"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          certificate_logo_path: string | null
          certificate_primary_color: string | null
          certificate_secondary_color: string | null
          created_at: string
          id: string
          language: string
          logo_dark_url: string | null
          logo_light_url: string | null
          name: string
          primary_color: string
          secondary_color: string
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          time_zone: string
          updated_at: string
          welcome_text: string | null
        }
        Insert: {
          certificate_logo_path?: string | null
          certificate_primary_color?: string | null
          certificate_secondary_color?: string | null
          created_at?: string
          id?: string
          language?: string
          logo_dark_url?: string | null
          logo_light_url?: string | null
          name: string
          primary_color?: string
          secondary_color?: string
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          time_zone?: string
          updated_at?: string
          welcome_text?: string | null
        }
        Update: {
          certificate_logo_path?: string | null
          certificate_primary_color?: string | null
          certificate_secondary_color?: string | null
          created_at?: string
          id?: string
          language?: string
          logo_dark_url?: string | null
          logo_light_url?: string | null
          name?: string
          primary_color?: string
          secondary_color?: string
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          time_zone?: string
          updated_at?: string
          welcome_text?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: Json }
      create_course: {
        Args: {
          p_category: string | null
          p_language: string
          p_level: string | null
          p_slug: string
          p_tenant_id: string
          p_title: string
        }
        Returns: string
      }
      create_draft_from_version: {
        Args: { p_version_id: string }
        Returns: string
      }
      create_invitation: {
        Args: { p_days?: number; p_email: string; p_offering_id: string }
        Returns: Json
      }
      create_offering: {
        Args: {
          p_client_id: string
          p_code: string
          p_ends_at: string | null
          p_enrollment_mode: Database["public"]["Enums"]["enrollment_mode"]
          p_modality: Database["public"]["Enums"]["offering_modality"]
          p_seats: number | null
          p_starts_at: string | null
          p_tenant_id: string
          p_timezone: string
          p_title: string
          p_version_id: string
        }
        Returns: string
      }
      enroll_user: {
        Args: { p_offering_id: string; p_user_id: string }
        Returns: string
      }
      close_attendance_session: { Args: { p_session_id: string }; Returns: Json }
      create_attendance_session: {
        Args: { p_date: string; p_offering_id: string; p_title: string }
        Returns: string
      }
      delete_attendance_session: { Args: { p_session_id: string }; Returns: undefined }
      get_attendance_sheet: { Args: { p_session_id: string }; Returns: Json }
      get_attendance_summary: { Args: { p_offering_id: string }; Returns: Json }
      get_my_attendance: { Args: { p_enrollment_id: string }; Returns: Json }
      get_offering_schedule: { Args: { p_offering_id: string }; Returns: Json }
      get_lesson_resources: { Args: { p_lesson_id: string }; Returns: Json }
      update_offering_student: {
        Args: {
          p_company: string; p_enrollment_id: string; p_full_name: string
          p_job_title: string; p_offering_id: string; p_phone: string
        }
        Returns: undefined
      }
      get_offering_resource_marks: { Args: { p_offering_id: string }; Returns: Json }
      set_offering_resource_mark: {
        Args: { p_offering_id: string; p_resource_id: string; p_shared: boolean; p_used: boolean }
        Returns: undefined
      }
      save_offering_schedule: {
        Args: { p_items: Json; p_offering_id: string }
        Returns: undefined
      }
      create_attendance_from_schedule: { Args: { p_offering_id: string }; Returns: number }
      reopen_attendance_session: {
        Args: { p_reason: string; p_session_id: string }
        Returns: undefined
      }
      set_attendance: {
        Args: { p_marks: Json; p_session_id: string }
        Returns: number
      }
      update_attendance_session: {
        Args: { p_date: string; p_session_id: string; p_title: string }
        Returns: undefined
      }
      evaluate_completion: { Args: { p_enrollment_id: string }; Returns: Json }
      finalize_final_grades: {
        Args: { p_offering_id: string }
        Returns: number
      }
      get_assessment_info: {
        Args: { p_assessment_id: string; p_enrollment_id: string }
        Returns: Json
      }
      get_assignment_for_student: {
        Args: { p_assignment_id: string; p_enrollment_id: string }
        Returns: Json
      }
      get_attempt: { Args: { p_attempt_id: string }; Returns: Json }
      get_attempt_result: { Args: { p_attempt_id: string }; Returns: Json }
      get_course_outline: { Args: { p_offering_id: string }; Returns: Json }
      get_gradebook: { Args: { p_offering_id: string }; Returns: Json }
      get_grading_queue: { Args: { p_offering_id: string }; Returns: Json }
      get_my_grades: { Args: { p_enrollment_id: string }; Returns: Json }
      get_offering_dimensions: { Args: { p_offering_id: string }; Returns: Json }
      save_offering_dimensions: {
        Args: { p_offering_id: string; p_dimensions: Json }
        Returns: Json
      }
      get_offering_certificates: {
        Args: { p_offering_id: string }
        Returns: Json
      }
      get_tenant_branding: {
        Args: { host: string }
        Returns: {
          language: string
          logo_dark_url: string
          logo_light_url: string
          name: string
          primary_color: string
          secondary_color: string
          time_zone: string
          welcome_text: string
        }[]
      }
      grade_attempt_answer: {
        Args: {
          p_attempt_id: string
          p_feedback?: string
          p_question_id: string
          p_score: number
        }
        Returns: Json
      }
      grade_submission: {
        Args: {
          p_feedback?: string
          p_raw_score?: number
          p_scores?: Json
          p_submission_id: string
        }
        Returns: Json
      }
      issue_certificate: { Args: { p_enrollment_id: string }; Returns: string }
      list_enrollable_students: {
        Args: { p_offering_id: string }
        Returns: {
          email: string
          full_name: string
          user_id: string
        }[]
      }
      list_my_tenants: {
        Args: never
        Returns: {
          name: string
          primary_host: string
          role: Database["public"]["Enums"]["tenant_role"]
          slug: string
          tenant_id: string
        }[]
      }
      list_offering_invitations: {
        Args: { p_offering_id: string }
        Returns: {
          accepted_at: string
          created_at: string
          email: string
          expires_at: string
          id: string
        }[]
      }
      list_offering_roster: {
        Args: { p_offering_id: string }
        Returns: {
          email: string
          enrolled_at: string
          enrollment_id: string
          full_name: string
          progress_pct: number
          status: Database["public"]["Enums"]["enrollment_status"]
          user_id: string
          phone: string | null
          job_title: string | null
          company: string | null
        }[]
      }
      mark_lesson_progress: {
        Args: {
          p_enrollment_id: string
          p_lesson_id: string
          p_position_seconds?: number
          p_status: Database["public"]["Enums"]["lesson_progress_status"]
          p_time_spent_delta?: number
        }
        Returns: Json
      }
      preview_invitation: { Args: { p_token: string }; Returns: Json }
      publish_version: { Args: { p_version_id: string }; Returns: string }
      reissue_certificate: {
        Args: { p_certificate_id: string; p_reason: string }
        Returns: string
      }
      revoke_certificate: {
        Args: { p_certificate_id: string; p_reason: string }
        Returns: undefined
      }
      revoke_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      save_answer: {
        Args: { p_answer: Json; p_attempt_id: string; p_question_id: string }
        Returns: undefined
      }
      set_enrollment_status: {
        Args: {
          p_enrollment_id: string
          p_status: Database["public"]["Enums"]["enrollment_status"]
        }
        Returns: string
      }
      set_manual_grade: {
        Args: {
          p_comment?: string
          p_enrollment_id: string
          p_grade_item_id: string
          p_reason?: string
          p_score: number
        }
        Returns: undefined
      }
      start_attempt: {
        Args: { p_assessment_id: string; p_enrollment_id: string }
        Returns: Json
      }
      submit_assignment: {
        Args: {
          p_assignment_id: string
          p_enrollment_id: string
          p_files?: Json
          p_link?: string
          p_text?: string
        }
        Returns: Json
      }
      submit_attempt: { Args: { p_attempt_id: string }; Returns: Json }
      verify_certificate: {
        Args: { p_code: string }
        Returns: {
          course_title: string
          holder_name: string
          hours: number | null
          instructor_name: string | null
          issued_at: string
          issuers: Json
          revoked_at: string | null
          status: string
        }[]
      }
    }
    Enums: {
      attempt_status: "in_progress" | "submitted" | "graded"
      attendance_session_status: "open" | "closed"
      attendance_status: "present" | "late" | "absent" | "excused"
      certificate_event_type:
        | "created"
        | "rendered"
        | "render_failed"
        | "revoked"
        | "reissued"
        | "downloaded"
      certificate_status: "pending_render" | "issued" | "revoked" | "reissued"
      client_member_role: "coordinator" | "member"
      client_status: "active" | "inactive"
      course_collaborator_role: "editor" | "viewer"
      course_status: "draft" | "active" | "archived"
      course_version_status: "draft" | "published" | "retired"
      domain_kind: "subdomain" | "custom"
      enrollment_mode: "invite" | "code" | "csv"
      enrollment_risk_level: "low" | "medium" | "high"
      enrollment_status:
        "pending" | "active" | "completed" | "dropped" | "suspended"
      grade_source_type: "assessment" | "assignment" | "manual"
      issuer_mode: "school" | "client" | "co_issue"
      lesson_progress_status: "in_progress" | "completed"
      lesson_type:
        | "video"
        | "reading"
        | "document"
        | "live"
        | "quiz"
        | "assignment"
        | "link"
      member_status: "active" | "suspended"
      offering_instructor_role: "lead" | "assistant"
      offering_modality: "self_paced" | "live" | "hybrid"
      offering_status: "draft" | "open" | "running" | "finished" | "archived"
      question_type: "single" | "multiple" | "true_false" | "short" | "essay"
      submission_status: "submitted" | "graded"
      tenant_role:
        | "owner"
        | "admin"
        | "instructor"
        | "instructor_guest"
        | "client_coordinator"
        | "student"
      tenant_status: "active" | "suspended" | "archived"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      attempt_status: ["in_progress", "submitted", "graded"],
      attendance_session_status: ["open", "closed"],
      attendance_status: ["present", "late", "absent", "excused"],
      certificate_event_type: [
        "created",
        "rendered",
        "render_failed",
        "revoked",
        "reissued",
        "downloaded",
      ],
      certificate_status: ["pending_render", "issued", "revoked", "reissued"],
      client_member_role: ["coordinator", "member"],
      client_status: ["active", "inactive"],
      course_collaborator_role: ["editor", "viewer"],
      course_status: ["draft", "active", "archived"],
      course_version_status: ["draft", "published", "retired"],
      domain_kind: ["subdomain", "custom"],
      enrollment_mode: ["invite", "code", "csv"],
      enrollment_risk_level: ["low", "medium", "high"],
      enrollment_status: [
        "pending",
        "active",
        "completed",
        "dropped",
        "suspended",
      ],
      grade_source_type: ["assessment", "assignment", "manual"],
      issuer_mode: ["school", "client", "co_issue"],
      lesson_progress_status: ["in_progress", "completed"],
      lesson_type: [
        "video",
        "reading",
        "document",
        "live",
        "quiz",
        "assignment",
        "link",
      ],
      member_status: ["active", "suspended"],
      offering_instructor_role: ["lead", "assistant"],
      offering_modality: ["self_paced", "live", "hybrid"],
      offering_status: ["draft", "open", "running", "finished", "archived"],
      question_type: ["single", "multiple", "true_false", "short", "essay"],
      submission_status: ["submitted", "graded"],
      tenant_role: [
        "owner",
        "admin",
        "instructor",
        "instructor_guest",
        "client_coordinator",
        "student",
      ],
      tenant_status: ["active", "suspended", "archived"],
    },
  },
} as const

export type TenantRole = Database['public']['Enums']['tenant_role']
