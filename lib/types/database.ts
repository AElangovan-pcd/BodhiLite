export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      answers: {
        Row: {
          attempt_id: string
          auto_score: number | null
          created_at: string
          graded_at: string | null
          id: string
          manual_score: number | null
          question_id: string
          rendered_question_snapshot: Json | null
          response: Json | null
          score_method: string | null
          updated_at: string
        }
        Insert: {
          attempt_id: string
          auto_score?: number | null
          created_at?: string
          graded_at?: string | null
          id?: string
          manual_score?: number | null
          question_id: string
          rendered_question_snapshot?: Json | null
          response?: Json | null
          score_method?: string | null
          updated_at?: string
        }
        Update: {
          attempt_id?: string
          auto_score?: number | null
          created_at?: string
          graded_at?: string | null
          id?: string
          manual_score?: number | null
          question_id?: string
          rendered_question_snapshot?: Json | null
          response?: Json | null
          score_method?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_overrides: {
        Row: {
          alternative_format: string | null
          assessment_id: string
          audit_log_id: string | null
          available_until_override: string | null
          extra_attempts: number | null
          extra_time_seconds: number | null
          granted_at: string
          granted_by_user_id: string
          id: string
          reason: string | null
          student_user_id: string
        }
        Insert: {
          alternative_format?: string | null
          assessment_id: string
          audit_log_id?: string | null
          available_until_override?: string | null
          extra_attempts?: number | null
          extra_time_seconds?: number | null
          granted_at?: string
          granted_by_user_id: string
          id?: string
          reason?: string | null
          student_user_id: string
        }
        Update: {
          alternative_format?: string | null
          assessment_id?: string
          audit_log_id?: string | null
          available_until_override?: string | null
          extra_attempts?: number | null
          extra_time_seconds?: number | null
          granted_at?: string
          granted_by_user_id?: string
          id?: string
          reason?: string | null
          student_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_overrides_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_overrides_granted_by_user_id_fkey"
            columns: ["granted_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_overrides_student_user_id_fkey"
            columns: ["student_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          assessment_type: Database["public"]["Enums"]["assessment_type"]
          closes_at: string | null
          created_at: string
          default_attempts: number
          id: string
          opens_at: string | null
          owner_user_id: string
          randomize_choices: boolean
          randomize_questions: boolean
          settings: Json
          slug: string
          status: Database["public"]["Enums"]["assessment_status"]
          time_limit_seconds: number | null
          title: string
          updated_at: string
        }
        Insert: {
          assessment_type?: Database["public"]["Enums"]["assessment_type"]
          closes_at?: string | null
          created_at?: string
          default_attempts?: number
          id?: string
          opens_at?: string | null
          owner_user_id: string
          randomize_choices?: boolean
          randomize_questions?: boolean
          settings?: Json
          slug: string
          status?: Database["public"]["Enums"]["assessment_status"]
          time_limit_seconds?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          assessment_type?: Database["public"]["Enums"]["assessment_type"]
          closes_at?: string | null
          created_at?: string
          default_attempts?: number
          id?: string
          opens_at?: string | null
          owner_user_id?: string
          randomize_choices?: boolean
          randomize_questions?: boolean
          settings?: Json
          slug?: string
          status?: Database["public"]["Enums"]["assessment_status"]
          time_limit_seconds?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      attempts: {
        Row: {
          assessment_id: string
          attempt_no: number
          created_at: string
          expires_at: string | null
          id: string
          seed: number
          started_at: string
          status: Database["public"]["Enums"]["attempt_status"]
          student_user_id: string
          submitted_at: string | null
        }
        Insert: {
          assessment_id: string
          attempt_no: number
          created_at?: string
          expires_at?: string | null
          id?: string
          seed: number
          started_at?: string
          status?: Database["public"]["Enums"]["attempt_status"]
          student_user_id: string
          submitted_at?: string | null
        }
        Update: {
          assessment_id?: string
          attempt_no?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          seed?: number
          started_at?: string
          status?: Database["public"]["Enums"]["attempt_status"]
          student_user_id?: string
          submitted_at?: string | null
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
            foreignKeyName: "attempts_student_user_id_fkey"
            columns: ["student_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          after: Json | null
          at: string
          before: Json | null
          id: string
          target_id: string | null
          target_kind: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          id?: string
          target_id?: string | null
          target_kind: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          id?: string
          target_id?: string | null
          target_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      media: {
        Row: {
          alt_text: string
          attached_to_id: string | null
          attached_to_kind: string | null
          created_at: string
          id: string
          mime: string
          owner_user_id: string
          storage_path: string
        }
        Insert: {
          alt_text: string
          attached_to_id?: string | null
          attached_to_kind?: string | null
          created_at?: string
          id?: string
          mime: string
          owner_user_id: string
          storage_path: string
        }
        Update: {
          alt_text?: string
          attached_to_id?: string | null
          attached_to_kind?: string | null
          created_at?: string
          id?: string
          mime?: string
          owner_user_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      question_variables: {
        Row: {
          id: string
          name: string
          position: number
          question_id: string
          spec: Json
          type: Database["public"]["Enums"]["variable_type"]
        }
        Insert: {
          id?: string
          name: string
          position: number
          question_id: string
          spec: Json
          type: Database["public"]["Enums"]["variable_type"]
        }
        Update: {
          id?: string
          name?: string
          position?: number
          question_id?: string
          spec?: Json
          type?: Database["public"]["Enums"]["variable_type"]
        }
        Relationships: [
          {
            foreignKeyName: "question_variables_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          assessment_id: string
          body: Json
          created_at: string
          id: string
          position: number
          scoring: Json
          type: Database["public"]["Enums"]["question_type"]
          updated_at: string
        }
        Insert: {
          assessment_id: string
          body?: Json
          created_at?: string
          id?: string
          position: number
          scoring?: Json
          type: Database["public"]["Enums"]["question_type"]
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          body?: Json
          created_at?: string
          id?: string
          position?: number
          scoring?: Json
          type?: Database["public"]["Enums"]["question_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_instructor: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "instructor" | "student"
      assessment_status: "draft" | "published" | "archived"
      assessment_type: "quiz" | "exam"
      attempt_status: "in_progress" | "submitted" | "graded" | "auto_submitted"
      question_type:
        | "mc"
        | "ma"
        | "tf"
        | "numeric"
        | "short_answer"
        | "fill_in"
        | "chem_draw_to_target"
        | "chem_pick_product"
        | "chem_identify_functional_group"
      variable_type:
        | "choice"
        | "randint"
        | "randfloat"
        | "derived"
        | "chemistry_compound"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["instructor", "student"],
      assessment_status: ["draft", "published", "archived"],
      assessment_type: ["quiz", "exam"],
      attempt_status: ["in_progress", "submitted", "graded", "auto_submitted"],
      question_type: [
        "mc",
        "ma",
        "tf",
        "numeric",
        "short_answer",
        "fill_in",
        "chem_draw_to_target",
        "chem_pick_product",
        "chem_identify_functional_group",
      ],
      variable_type: [
        "choice",
        "randint",
        "randfloat",
        "derived",
        "chemistry_compound",
      ],
    },
  },
} as const

