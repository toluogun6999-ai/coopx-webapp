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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          priority: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          priority?: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          priority?: string
          title?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          created_at: string
          details: Json | null
          entity: string
          entity_id: string | null
          id: string
          ip_address: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          details?: Json | null
          entity: string
          entity_id?: string | null
          id?: string
          ip_address?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          details?: Json | null
          entity?: string
          entity_id?: string | null
          id?: string
          ip_address?: string | null
        }
        Relationships: []
      }
      loan_repayments: {
        Row: {
          amount: number
          created_at: string
          id: string
          loan_id: string
          member_id: string
          paid_at: string
          recorded_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          loan_id: string
          member_id: string
          paid_at?: string
          recorded_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          loan_id?: string
          member_id?: string
          paid_at?: string
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loan_repayments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          admin_note: string | null
          amount: number
          applied_at: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          emi: number
          id: string
          member_id: string
          ml_factors: Json | null
          ml_risk_level: string | null
          ml_risk_probability: number | null
          paid: number
          purpose: string
          rate: number
          status: Database["public"]["Enums"]["loan_status"]
          tenure_months: number
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          amount: number
          applied_at?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          emi: number
          id?: string
          member_id: string
          ml_factors?: Json | null
          ml_risk_level?: string | null
          ml_risk_probability?: number | null
          paid?: number
          purpose: string
          rate?: number
          status?: Database["public"]["Enums"]["loan_status"]
          tenure_months: number
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          applied_at?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          emi?: number
          id?: string
          member_id?: string
          ml_factors?: Json | null
          ml_risk_level?: string | null
          ml_risk_probability?: number | null
          paid?: number
          purpose?: string
          rate?: number
          status?: Database["public"]["Enums"]["loan_status"]
          tenure_months?: number
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          read: boolean
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          read?: boolean
          title: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          read?: boolean
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          id_document_url: string | null
          joined_at: string
          member_code: string | null
          phone: string | null
          status: Database["public"]["Enums"]["member_status"]
          suspension_reason: string | null
          updated_at: string
          verified_email: boolean
          verified_phone: boolean
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          id_document_url?: string | null
          joined_at?: string
          member_code?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          suspension_reason?: string | null
          updated_at?: string
          verified_email?: boolean
          verified_phone?: boolean
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          id_document_url?: string | null
          joined_at?: string
          member_code?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          suspension_reason?: string | null
          updated_at?: string
          verified_email?: boolean
          verified_phone?: boolean
        }
        Relationships: []
      }
      savings_transactions: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          loan_id: string | null
          member_id: string
          note: string | null
          occurred_at: string
          type: Database["public"]["Enums"]["txn_type"]
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          loan_id?: string | null
          member_id: string
          note?: string | null
          occurred_at?: string
          type: Database["public"]["Enums"]["txn_type"]
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          loan_id?: string | null
          member_id?: string
          note?: string | null
          occurred_at?: string
          type?: Database["public"]["Enums"]["txn_type"]
        }
        Relationships: [
          {
            foreignKeyName: "savings_transactions_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          currency: string
          default_interest_rate: number
          dividend_rate: number
          id: boolean
          late_fee_pct: number
          max_loan_multiplier: number
          min_membership_months: number
          min_savings_for_loan: number
          monthly_contribution_min: number
          society_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          currency?: string
          default_interest_rate?: number
          dividend_rate?: number
          id?: boolean
          late_fee_pct?: number
          max_loan_multiplier?: number
          min_membership_months?: number
          min_savings_for_loan?: number
          monthly_contribution_min?: number
          society_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          currency?: string
          default_interest_rate?: number
          dividend_rate?: number
          id?: boolean
          late_fee_pct?: number
          max_loan_multiplier?: number
          min_membership_months?: number
          min_savings_for_loan?: number
          monthly_contribution_min?: number
          society_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "member"
        | "super_admin"
        | "treasurer"
        | "secretary"
        | "loan_officer"
        | "auditor"
      loan_status:
        | "Pending"
        | "Approved"
        | "Rejected"
        | "Disbursed"
        | "Repaid"
        | "Overdue"
      member_status:
        | "Pending"
        | "Approved"
        | "Suspended"
        | "Rejected"
        | "Inactive"
      notification_type: "info" | "success" | "warning" | "error"
      txn_type:
        | "Contribution"
        | "Withdrawal"
        | "Loan Disbursement"
        | "Loan Repayment"
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
  public: {
    Enums: {
      app_role: [
        "admin",
        "member",
        "super_admin",
        "treasurer",
        "secretary",
        "loan_officer",
        "auditor",
      ],
      loan_status: [
        "Pending",
        "Approved",
        "Rejected",
        "Disbursed",
        "Repaid",
        "Overdue",
      ],
      member_status: [
        "Pending",
        "Approved",
        "Suspended",
        "Rejected",
        "Inactive",
      ],
      notification_type: ["info", "success", "warning", "error"],
      txn_type: [
        "Contribution",
        "Withdrawal",
        "Loan Disbursement",
        "Loan Repayment",
      ],
    },
  },
} as const
