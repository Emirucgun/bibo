export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      activity_stats: {
        Row: {
          activity_type: string;
          retained_n: number;
          taught_n: number;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          activity_type: string;
          retained_n?: number;
          taught_n?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          activity_type?: string;
          retained_n?: number;
          taught_n?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      app_settings: {
        Row: {
          key: string;
          updated_at: string;
          value: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          key: string;
          updated_at?: string;
          value: NonNullable<Json>;
        };
        Update: {
          key?: string;
          updated_at?: string;
          value?: NonNullable<Json>;
        };
        Relationships: [];
      };
      attempts: {
        Row: {
          correction: string | null;
          created_at: string;
          explain_opened: boolean;
          explanation_long_tr: string | null;
          feedback_short_tr: string | null;
          graded_by: string | null;
          hint_used: boolean;
          id: string;
          is_correct: boolean | null;
          item_id: string;
          response: NonNullable<Json>;
          score: number | null;
          time_ms: number | null;
          try_no: number;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          correction?: string | null;
          created_at?: string;
          explain_opened?: boolean;
          explanation_long_tr?: string | null;
          feedback_short_tr?: string | null;
          graded_by?: string | null;
          hint_used?: boolean;
          id?: string;
          is_correct?: boolean | null;
          item_id: string;
          response: NonNullable<Json>;
          score?: number | null;
          time_ms?: number | null;
          try_no?: number;
          user_id: string;
        };
        Update: {
          correction?: string | null;
          created_at?: string;
          explain_opened?: boolean;
          explanation_long_tr?: string | null;
          feedback_short_tr?: string | null;
          graded_by?: string | null;
          hint_used?: boolean;
          id?: string;
          is_correct?: boolean | null;
          item_id?: string;
          response?: NonNullable<Json>;
          score?: number | null;
          time_ms?: number | null;
          try_no?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attempts_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
        ];
      };
      cohorts: {
        Row: {
          capacity: number;
          created_at: string;
          ends_on: string | null;
          id: string;
          invite_code: string;
          name: string;
          starts_on: string | null;
        };
        ComputedFields: never;
        Insert: {
          capacity?: number;
          created_at?: string;
          ends_on?: string | null;
          id?: string;
          invite_code: string;
          name: string;
          starts_on?: string | null;
        };
        Update: {
          capacity?: number;
          created_at?: string;
          ends_on?: string | null;
          id?: string;
          invite_code?: string;
          name?: string;
          starts_on?: string | null;
        };
        Relationships: [];
      };
      diagnoses: {
        Row: {
          confidence: number;
          created_at: string;
          evidence: NonNullable<Json>;
          id: string;
          kind: string;
          message_tr: string;
          shown_at: string | null;
          status: string;
          topic_id: string;
          user_feedback: string | null;
          user_id: string;
          weak_activity: string | null;
          weak_skill: string | null;
        };
        ComputedFields: never;
        Insert: {
          confidence: number;
          created_at?: string;
          evidence: NonNullable<Json>;
          id?: string;
          kind: string;
          message_tr: string;
          shown_at?: string | null;
          status?: string;
          topic_id: string;
          user_feedback?: string | null;
          user_id: string;
          weak_activity?: string | null;
          weak_skill?: string | null;
        };
        Update: {
          confidence?: number;
          created_at?: string;
          evidence?: NonNullable<Json>;
          id?: string;
          kind?: string;
          message_tr?: string;
          shown_at?: string | null;
          status?: string;
          topic_id?: string;
          user_feedback?: string | null;
          user_id?: string;
          weak_activity?: string | null;
          weak_skill?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "diagnoses_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
        ];
      };
      error_events: {
        Row: {
          activity_type: string;
          attempt_id: string;
          correction: string | null;
          created_at: string;
          id: string;
          l1_code: string;
          mode: string;
          review_sampled: boolean;
          skill: string;
          source: string;
          topic_id: string | null;
          user_id: string;
          wrong_span: string | null;
        };
        ComputedFields: never;
        Insert: {
          activity_type: string;
          attempt_id: string;
          correction?: string | null;
          created_at?: string;
          id?: string;
          l1_code: string;
          mode: string;
          review_sampled?: boolean;
          skill: string;
          source: string;
          topic_id?: string | null;
          user_id: string;
          wrong_span?: string | null;
        };
        Update: {
          activity_type?: string;
          attempt_id?: string;
          correction?: string | null;
          created_at?: string;
          id?: string;
          l1_code?: string;
          mode?: string;
          review_sampled?: boolean;
          skill?: string;
          source?: string;
          topic_id?: string | null;
          user_id?: string;
          wrong_span?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "error_events_attempt_id_fkey";
            columns: ["attempt_id"];
            isOneToOne: false;
            referencedRelation: "attempts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "error_events_l1_code_fkey";
            columns: ["l1_code"];
            isOneToOne: false;
            referencedRelation: "l1_codes";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "error_events_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          created_at: string;
          id: number;
          name: string;
          props: Json | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: number;
          name: string;
          props?: Json | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          name?: string;
          props?: Json | null;
          user_id?: string;
        };
        Relationships: [];
      };
      item_keys: {
        Row: {
          item_id: string;
          key: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          item_id: string;
          key: NonNullable<Json>;
        };
        Update: {
          item_id?: string;
          key?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "item_keys_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: true;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
        ];
      };
      items: {
        Row: {
          activity_type: string;
          created_at: string;
          credited: boolean;
          id: string;
          interest: string | null;
          l1_target: string | null;
          mode: string;
          payload: NonNullable<Json>;
          position: number;
          purpose: string;
          session_id: string;
          skill: string;
          topic_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          activity_type: string;
          created_at?: string;
          credited?: boolean;
          id?: string;
          interest?: string | null;
          l1_target?: string | null;
          mode: string;
          payload: NonNullable<Json>;
          position: number;
          purpose: string;
          session_id: string;
          skill: string;
          topic_id: string;
          user_id: string;
        };
        Update: {
          activity_type?: string;
          created_at?: string;
          credited?: boolean;
          id?: string;
          interest?: string | null;
          l1_target?: string | null;
          mode?: string;
          payload?: NonNullable<Json>;
          position?: number;
          purpose?: string;
          session_id?: string;
          skill?: string;
          topic_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "items_l1_target_fkey";
            columns: ["l1_target"];
            isOneToOne: false;
            referencedRelation: "l1_codes";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "items_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "items_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
        ];
      };
      l1_codes: {
        Row: {
          code: string;
          is_l1: boolean;
          name_tr: string;
          right_example: string | null;
          rule_tr: string | null;
          topic_id: string | null;
          wrong_example: string | null;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          is_l1: boolean;
          name_tr: string;
          right_example?: string | null;
          rule_tr?: string | null;
          topic_id?: string | null;
          wrong_example?: string | null;
        };
        Update: {
          code?: string;
          is_l1?: boolean;
          name_tr?: string;
          right_example?: string | null;
          rule_tr?: string | null;
          topic_id?: string | null;
          wrong_example?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "l1_codes_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
        ];
      };
      llm_usage: {
        Row: {
          audio_seconds: number | null;
          cache_read_tokens: number;
          cache_write_tokens: number;
          cost_usd: number;
          created_at: string;
          error: string | null;
          id: number;
          input_tokens: number | null;
          latency_ms: number | null;
          model: string;
          ok: boolean;
          output_tokens: number | null;
          provider: string;
          purpose: string;
          session_id: string | null;
          tts_chars: number | null;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          audio_seconds?: number | null;
          cache_read_tokens?: number;
          cache_write_tokens?: number;
          cost_usd?: number;
          created_at?: string;
          error?: string | null;
          id?: number;
          input_tokens?: number | null;
          latency_ms?: number | null;
          model: string;
          ok: boolean;
          output_tokens?: number | null;
          provider: string;
          purpose: string;
          session_id?: string | null;
          tts_chars?: number | null;
          user_id?: string | null;
        };
        Update: {
          audio_seconds?: number | null;
          cache_read_tokens?: number;
          cache_write_tokens?: number;
          cost_usd?: number;
          created_at?: string;
          error?: string | null;
          id?: number;
          input_tokens?: number | null;
          latency_ms?: number | null;
          model?: string;
          ok?: boolean;
          output_tokens?: number | null;
          provider?: string;
          purpose?: string;
          session_id?: string | null;
          tts_chars?: number | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "llm_usage_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      mastery: {
        Row: {
          correct: number;
          last_seen_at: string | null;
          n: number;
          next_review_at: string | null;
          score: number;
          skill: string;
          topic_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          correct?: number;
          last_seen_at?: string | null;
          n?: number;
          next_review_at?: string | null;
          score: number;
          skill: string;
          topic_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          correct?: number;
          last_seen_at?: string | null;
          n?: number;
          next_review_at?: string | null;
          score?: number;
          skill?: string;
          topic_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mastery_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          adult_confirmed_at: string | null;
          cohort_id: string | null;
          consent_at: string | null;
          consent_version: string | null;
          created_at: string;
          display_name: string | null;
          explain_mode: string;
          id: string;
          interests: string[];
          level_est: string | null;
          level_self: string | null;
          onboarding_step: string;
          role: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          adult_confirmed_at?: string | null;
          cohort_id?: string | null;
          consent_at?: string | null;
          consent_version?: string | null;
          created_at?: string;
          display_name?: string | null;
          explain_mode?: string;
          id: string;
          interests?: string[];
          level_est?: string | null;
          level_self?: string | null;
          onboarding_step?: string;
          role?: string;
          updated_at?: string;
        };
        Update: {
          adult_confirmed_at?: string | null;
          cohort_id?: string | null;
          consent_at?: string | null;
          consent_version?: string | null;
          created_at?: string;
          display_name?: string | null;
          explain_mode?: string;
          id?: string;
          interests?: string[];
          level_est?: string | null;
          level_self?: string | null;
          onboarding_step?: string;
          role?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_cohort_id_fkey";
            columns: ["cohort_id"];
            isOneToOne: false;
            referencedRelation: "cohorts";
            referencedColumns: ["id"];
          },
        ];
      };
      school_topics: {
        Row: {
          created_at: string;
          topic_id: string | null;
          user_id: string;
          week_start: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          topic_id?: string | null;
          user_id: string;
          week_start: string;
        };
        Update: {
          created_at?: string;
          topic_id?: string | null;
          user_id?: string;
          week_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: "school_topics_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
        ];
      };
      sessions: {
        Row: {
          comment: string | null;
          cost_usd: number;
          created_at: string;
          finished_at: string | null;
          focus_topic_id: string | null;
          id: string;
          kind: string;
          plan: Json | null;
          rating: number | null;
          started_at: string | null;
          status: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          comment?: string | null;
          cost_usd?: number;
          created_at?: string;
          finished_at?: string | null;
          focus_topic_id?: string | null;
          id?: string;
          kind: string;
          plan?: Json | null;
          rating?: number | null;
          started_at?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          comment?: string | null;
          cost_usd?: number;
          created_at?: string;
          finished_at?: string | null;
          focus_topic_id?: string | null;
          id?: string;
          kind?: string;
          plan?: Json | null;
          rating?: number | null;
          started_at?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sessions_focus_topic_id_fkey";
            columns: ["focus_topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
        ];
      };
      teacher_reviews: {
        Row: {
          corrected_l1_code: string | null;
          created_at: string;
          error_event_id: string;
          id: string;
          note: string | null;
          reviewer_id: string | null;
          verdict: string;
        };
        ComputedFields: never;
        Insert: {
          corrected_l1_code?: string | null;
          created_at?: string;
          error_event_id: string;
          id?: string;
          note?: string | null;
          reviewer_id?: string | null;
          verdict: string;
        };
        Update: {
          corrected_l1_code?: string | null;
          created_at?: string;
          error_event_id?: string;
          id?: string;
          note?: string | null;
          reviewer_id?: string | null;
          verdict?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_reviews_corrected_l1_code_fkey";
            columns: ["corrected_l1_code"];
            isOneToOne: false;
            referencedRelation: "l1_codes";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "teacher_reviews_error_event_id_fkey";
            columns: ["error_event_id"];
            isOneToOne: true;
            referencedRelation: "error_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teacher_reviews_reviewer_id_fkey";
            columns: ["reviewer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      topics: {
        Row: {
          active: boolean;
          description_tr: string;
          id: string;
          kind: string;
          l1_risk: number;
          level: string;
          prereqs: string[];
          sort: number;
          title_en: string;
          title_tr: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          description_tr: string;
          id: string;
          kind: string;
          l1_risk: number;
          level: string;
          prereqs?: string[];
          sort: number;
          title_en: string;
          title_tr: string;
        };
        Update: {
          active?: boolean;
          description_tr?: string;
          id?: string;
          kind?: string;
          l1_risk?: number;
          level?: string;
          prereqs?: string[];
          sort?: number;
          title_en?: string;
          title_tr?: string;
        };
        Relationships: [];
      };
      tts_cache: {
        Row: {
          chars: number;
          created_at: string;
          hash: string;
          last_used_at: string;
          rate: number;
          storage_path: string;
          voice: string;
        };
        ComputedFields: never;
        Insert: {
          chars: number;
          created_at?: string;
          hash: string;
          last_used_at?: string;
          rate: number;
          storage_path: string;
          voice: string;
        };
        Update: {
          chars?: number;
          created_at?: string;
          hash?: string;
          last_used_at?: string;
          rate?: number;
          storage_path?: string;
          voice?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_session_cost: {
        Args: { p_session_id: string; p_usd: number };
        Returns: undefined;
      };
      llm_cost_since: { Args: { since: string }; Returns: number };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
