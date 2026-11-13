"use client";
import { App, ConfigProvider } from "antd";
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#3168da",
          borderRadius: 8,
          fontFamily: "Arial, Helvetica, sans-serif",
          colorText: "#24324a",
          colorBgLayout: "#f5f7fb",
        },
        components: {
          Table: { headerBg: "#f7f9fc" },
          Button: { controlHeight: 38 },
        },
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}
