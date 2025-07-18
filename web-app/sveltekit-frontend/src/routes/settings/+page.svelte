<script lang="ts">
  import { browser } from "$app/environment";
  import { Button } from "$lib/components/ui/button";
  import { notifications } from "$lib/stores/notification";
  import { user } from "$lib/stores/user";
  import { Download, Eye, EyeOff, Palette, RefreshCw, Save, Settings, Shield, Trash2, Upload, User as UserIcon } from "lucide-svelte";
  import { onMount } from "svelte";

  // Profile settings
  let profile = {
    name: "",
    email: "",
    role: "investigator",
    department: "",
    phone: "",
    bio: "",
    avatar: null as File | null,
  };

  // App preferences
  let preferences = {
    theme: "light",
    language: "en",
    timezone: "UTC",
    dateFormat: "MM/DD/YYYY",
    timeFormat: "12h",
    enableNotifications: true,
    enableEmailNotifications: false,
    enableSMSNotifications: false,
    autoSave: true,
    defaultViewMode: "grid",
    itemsPerPage: 20,
  };

  // Security settings
  let security = {
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
    twoFactorEnabled: false,
    sessionTimeout: 30, // minutes
    allowRememberMe: true,
  };

  // Export/Import settings
  let dataSettings = {
    includePersonalData: true,
    includeSystemLogs: false,
    exportFormat: "json",
    autoBackup: false,
    backupFrequency: "weekly",
  };

  // State
  let activeTab = "profile";
  let isLoading = false;
  let isSaving = false;
  let showPasswords = false;
  let avatarPreview: string | null = null;

  // Available options
  const themes = [
    { value: "light", label: "Light Theme" },
    { value: "dark", label: "Dark Theme" },
    { value: "auto", label: "System Theme" },
  ];

  const languages = [
    { value: "en", label: "English" },
    { value: "es", label: "Spanish" },
    { value: "fr", label: "French" },
    { value: "de", label: "German" },
  ];

  const timezones = [
    { value: "UTC", label: "UTC" },
    { value: "America/New_York", label: "Eastern Time" },
    { value: "America/Chicago", label: "Central Time" },
    { value: "America/Denver", label: "Mountain Time" },
    { value: "America/Los_Angeles", label: "Pacific Time" },
  ];

  const roles = [
    { value: "investigator", label: "Investigator" },
    { value: "analyst", label: "Analyst" },
    { value: "supervisor", label: "Supervisor" },
    { value: "admin", label: "Administrator" },
  ];

  onMount(() => {
    loadSettings();
  });

  async function loadSettings() {
    isLoading = true;

    try {
      // Load user profile
      if ($user) {
        profile.name = $user.name || "";
        profile.email = $user.email || "";
        profile.role = $user.role || "investigator";
}
      // Load preferences from localStorage
      if (browser) {
        const savedPrefs = localStorage.getItem("userPreferences");
        if (savedPrefs) {
          preferences = { ...preferences, ...JSON.parse(savedPrefs) };
}
        const savedSecurity = localStorage.getItem("securitySettings");
        if (savedSecurity) {
          const securityData = JSON.parse(savedSecurity);
          security = { ...security, ...securityData };
          // Don't load passwords from storage
          security.currentPassword = "";
          security.newPassword = "";
          security.confirmPassword = "";
}
        const savedDataSettings = localStorage.getItem("dataSettings");
        if (savedDataSettings) {
          dataSettings = { ...dataSettings, ...JSON.parse(savedDataSettings) };
}}
    } catch (error) {
      console.error("Error loading settings:", error);
      notifications.add({
        type: "error",
        title: "Settings Error",
        message: "Failed to load settings",
      });
    } finally {
      isLoading = false;
}}
  async function saveSettings() {
    isSaving = true;

    try {
      // Validate password change if attempted
      if (
        security.newPassword &&
        security.newPassword !== security.confirmPassword
      ) {
        throw new Error("Passwords do not match");
}
      // Save to server (mock API calls)
      const updates: any = {};

      // Profile updates
      if (profile.name || profile.department || profile.phone || profile.bio) {
        updates.profile = profile;
}
      // Password change
      if (security.currentPassword && security.newPassword) {
        updates.password = {
          current: security.currentPassword,
          new: security.newPassword,
        };
}
      // Send updates to server
      if (Object.keys(updates).length > 0) {
        const response = await fetch("/api/user/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          throw new Error("Failed to save profile settings");
}}
      // Save preferences locally
      if (browser) {
        localStorage.setItem("userPreferences", JSON.stringify(preferences));
        localStorage.setItem(
          "securitySettings",
          JSON.stringify({
            twoFactorEnabled: security.twoFactorEnabled,
            sessionTimeout: security.sessionTimeout,
            allowRememberMe: security.allowRememberMe,
          })
        );
        localStorage.setItem("dataSettings", JSON.stringify(dataSettings));

        // Apply theme immediately
        document.documentElement.setAttribute("data-theme", preferences.theme);
}
      // Clear password fields
      security.currentPassword = "";
      security.newPassword = "";
      security.confirmPassword = "";

      notifications.add({
        type: "success",
        title: "Settings Saved",
        message: "Settings saved successfully",
      });
    } catch (error) {
      console.error("Error saving settings:", error);
      notifications.add({
        type: "error",
        title: "Save Error",
        message:
          error instanceof Error ? error.message : "Failed to save settings",
      });
    } finally {
      isSaving = false;
}}
  function handleAvatarChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];

    if (file) {
      profile.avatar = file;

      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        avatarPreview = e.target?.result as string;
      };
      reader.readAsDataURL(file);
}}
  function clearAvatar() {
    profile.avatar = null;
    avatarPreview = null;
}
  async function exportUserData() {
    try {
      const response = await fetch("/api/user/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dataSettings),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `user-data-${new Date().toISOString().split("T")[0]}.${dataSettings.exportFormat}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        notifications.add({
          type: "success",
          title: "Export Complete",
          message: "User data exported successfully",
        });
}
    } catch (error) {
      notifications.add({
        type: "error",
        title: "Export Error",
        message: "Failed to export user data",
      });
}}
  function resetToDefaults() {
    if (
      confirm(
        "Are you sure you want to reset all settings to defaults? This cannot be undone."
      )
    ) {
      preferences = {
        theme: "light",
        language: "en",
        timezone: "UTC",
        dateFormat: "MM/DD/YYYY",
        timeFormat: "12h",
        enableNotifications: true,
        enableEmailNotifications: false,
        enableSMSNotifications: false,
        autoSave: true,
        defaultViewMode: "grid",
        itemsPerPage: 20,
      };

      security = {
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
        twoFactorEnabled: false,
        sessionTimeout: 30,
        allowRememberMe: true,
      };

      dataSettings = {
        includePersonalData: true,
        includeSystemLogs: false,
        exportFormat: "json",
        autoBackup: false,
        backupFrequency: "weekly",
      };

      notifications.add({
        type: "info",
        title: "Settings Reset",
        message: "Settings reset to defaults",
      });
}}
</script>

<svelte:head>
  <title>Settings - Legal Case Management</title>
  <meta name="description" content="User profile and application settings" />
</svelte:head>

<div class="container mx-auto px-4">
  <!-- Header -->
  <div
    class="container mx-auto px-4"
  >
    <h1 class="container mx-auto px-4">
      <Settings class="container mx-auto px-4" />
      Settings
    </h1>
    <p class="container mx-auto px-4">
      Manage your profile, preferences, and security settings
    </p>
  </div>

  <div class="container mx-auto px-4">
    <!-- Settings Navigation -->
    <div class="container mx-auto px-4">
      <div class="container mx-auto px-4">
        <nav class="container mx-auto px-4">
          <button
            type="button"
            class="container mx-auto px-4"
            class:bg-blue-100={activeTab === "profile"}
            class:text-blue-700={activeTab === "profile"}
            class:hover:bg-gray-100={activeTab !== "profile"}
            on:click={() => (activeTab = "profile")}
          >
            <UserIcon class="container mx-auto px-4" />
            Profile
          </button>

          <button
            type="button"
            class="container mx-auto px-4"
            class:bg-blue-100={activeTab === "preferences"}
            class:text-blue-700={activeTab === "preferences"}
            class:hover:bg-gray-100={activeTab !== "preferences"}
            on:click={() => (activeTab = "preferences")}
          >
            <Palette class="container mx-auto px-4" />
            Preferences
          </button>

          <button
            type="button"
            class="container mx-auto px-4"
            class:bg-blue-100={activeTab === "security"}
            class:text-blue-700={activeTab === "security"}
            class:hover:bg-gray-100={activeTab !== "security"}
            on:click={() => (activeTab = "security")}
          >
            <Shield class="container mx-auto px-4" />
            Security
          </button>

          <button
            type="button"
            class="container mx-auto px-4"
            class:bg-blue-100={activeTab === "data"}
            class:text-blue-700={activeTab === "data"}
            class:hover:bg-gray-100={activeTab !== "data"}
            on:click={() => (activeTab = "data")}
          >
            <Download class="container mx-auto px-4" />
            Data & Privacy
          </button>
        </nav>
      </div>
    </div>

    <!-- Settings Content -->
    <div class="container mx-auto px-4">
      {#if isLoading}
        <div class="container mx-auto px-4">
          <RefreshCw
            class="container mx-auto px-4"
          />
          <p class="container mx-auto px-4">Loading settings...</p>
        </div>
      {:else}
        <!-- Profile Tab -->
        {#if activeTab === "profile"}
          <div class="container mx-auto px-4">
            <h2 class="container mx-auto px-4">
              <UserIcon class="container mx-auto px-4" />
              Profile Information
            </h2>

            <div class="container mx-auto px-4">
              <!-- Avatar Section -->
              <div class="container mx-auto px-4">
                <div class="container mx-auto px-4">
                  {#if avatarPreview}
                    <img
                      src={avatarPreview}
                      alt="Avatar preview"
                      class="container mx-auto px-4"
                    />
                  {:else}
                    <div
                      class="container mx-auto px-4"
                    >
                      <UserIcon class="container mx-auto px-4" />
                    </div>
                  {/if}
                </div>
                <div class="container mx-auto px-4">
                  <label
                    for="avatar"
                    class="container mx-auto px-4"
                  >
                    Profile Picture
                  </label>
                  <div class="container mx-auto px-4">
                    <input
                      id="avatar"
                      type="file"
                      accept="image/*"
                      on:change={handleAvatarChange}
                      class="container mx-auto px-4"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      on:click={() =>
                        document.getElementById("avatar")?.click()}
                    >
                      <Upload class="container mx-auto px-4" />
                      Upload
                    </Button>
                    {#if avatarPreview}
                      <Button
                        variant="outline"
                        size="sm"
                        on:click={() => clearAvatar()}
                      >
                        <Trash2 class="container mx-auto px-4" />
                        Remove
                      </Button>
                    {/if}
                  </div>
                </div>
              </div>

              <!-- Profile Fields -->
              <div class="container mx-auto px-4">
                <div>
                  <label
                    for="name"
                    class="container mx-auto px-4"
                  >
                    Full Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    bind:value={profile.name}
                    class="container mx-auto px-4"
                    placeholder="Enter your full name"
                  />
                </div>

                <div>
                  <label
                    for="email"
                    class="container mx-auto px-4"
                  >
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    bind:value={profile.email}
                    class="container mx-auto px-4"
                    placeholder="Enter your email"
                  />
                </div>

                <div>
                  <label
                    for="role"
                    class="container mx-auto px-4"
                  >
                    Role
                  </label>
                  <select
                    id="role"
                    bind:value={profile.role}
                    class="container mx-auto px-4"
                  >
                    {#each roles as role}
                      <option value={role.value}>{role.label}</option>
                    {/each}
                  </select>
                </div>

                <div>
                  <label
                    for="department"
                    class="container mx-auto px-4"
                  >
                    Department
                  </label>
                  <input
                    id="department"
                    type="text"
                    bind:value={profile.department}
                    class="container mx-auto px-4"
                    placeholder="Enter your department"
                  />
                </div>

                <div>
                  <label
                    for="phone"
                    class="container mx-auto px-4"
                  >
                    Phone Number
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    bind:value={profile.phone}
                    class="container mx-auto px-4"
                    placeholder="Enter your phone number"
                  />
                </div>
              </div>

              <div>
                <label
                  for="bio"
                  class="container mx-auto px-4"
                >
                  Bio
                </label>
                <textarea
                  id="bio"
                  bind:value={profile.bio}
                  rows={4}
                  class="container mx-auto px-4"
                  placeholder="Tell us a bit about yourself..."
                ></textarea>
              </div>
            </div>
          </div>
        {/if}

        <!-- Preferences Tab -->
        {#if activeTab === "preferences"}
          <div class="container mx-auto px-4">
            <h2 class="container mx-auto px-4">
              <Palette class="container mx-auto px-4" />
              Application Preferences
            </h2>

            <div class="container mx-auto px-4">
              <!-- Appearance -->
              <div>
                <h3 class="container mx-auto px-4">Appearance</h3>
                <div class="container mx-auto px-4">
                  <div>
                    <label
                      for="theme"
                      class="container mx-auto px-4"
                    >
                      Theme
                    </label>
                    <select
                      id="theme"
                      bind:value={preferences.theme}
                      class="container mx-auto px-4"
                    >
                      {#each themes as theme}
                        <option value={theme.value}>{theme.label}</option>
                      {/each}
                    </select>
                  </div>

                  <div>
                    <label
                      for="language"
                      class="container mx-auto px-4"
                    >
                      Language
                    </label>
                    <select
                      id="language"
                      bind:value={preferences.language}
                      class="container mx-auto px-4"
                    >
                      {#each languages as language}
                        <option value={language.value}>{language.label}</option>
                      {/each}
                    </select>
                  </div>

                  <div>
                    <label
                      for="timezone"
                      class="container mx-auto px-4"
                    >
                      Timezone
                    </label>
                    <select
                      id="timezone"
                      bind:value={preferences.timezone}
                      class="container mx-auto px-4"
                    >
                      {#each timezones as timezone}
                        <option value={timezone.value}>{timezone.label}</option>
                      {/each}
                    </select>
                  </div>
                </div>
              </div>

              <!-- Notifications -->
              <div>
                <h3 class="container mx-auto px-4">Notifications</h3>
                <div class="container mx-auto px-4">
                  <div class="container mx-auto px-4">
                    <input
                      id="notifications"
                      type="checkbox"
                      bind:checked={preferences.enableNotifications}
                      class="container mx-auto px-4"
                    />
                    <label for="notifications" class="container mx-auto px-4">
                      Enable in-app notifications
                    </label>
                  </div>

                  <div class="container mx-auto px-4">
                    <input
                      id="email-notifications"
                      type="checkbox"
                      bind:checked={preferences.enableEmailNotifications}
                      class="container mx-auto px-4"
                    />
                    <label
                      for="email-notifications"
                      class="container mx-auto px-4"
                    >
                      Enable email notifications
                    </label>
                  </div>

                  <div class="container mx-auto px-4">
                    <input
                      id="sms-notifications"
                      type="checkbox"
                      bind:checked={preferences.enableSMSNotifications}
                      class="container mx-auto px-4"
                    />
                    <label
                      for="sms-notifications"
                      class="container mx-auto px-4"
                    >
                      Enable SMS notifications
                    </label>
                  </div>
                </div>
              </div>

              <!-- Interface -->
              <div>
                <h3 class="container mx-auto px-4">Interface</h3>
                <div class="container mx-auto px-4">
                  <div class="container mx-auto px-4">
                    <input
                      id="auto-save"
                      type="checkbox"
                      bind:checked={preferences.autoSave}
                      class="container mx-auto px-4"
                    />
                    <label for="auto-save" class="container mx-auto px-4">
                      Enable auto-save
                    </label>
                  </div>

                  <div>
                    <label
                      for="items-per-page"
                      class="container mx-auto px-4"
                    >
                      Items per page
                    </label>
                    <select
                      id="items-per-page"
                      bind:value={preferences.itemsPerPage}
                      class="container mx-auto px-4"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <!-- Security Tab -->
        {#if activeTab === "security"}
          <div class="container mx-auto px-4">
            <h2 class="container mx-auto px-4">
              <Shield class="container mx-auto px-4" />
              Security Settings
            </h2>

            <div class="container mx-auto px-4">
              <!-- Password Change -->
              <div>
                <h3 class="container mx-auto px-4">Change Password</h3>
                <div class="container mx-auto px-4">
                  <div>
                    <label
                      for="current-password"
                      class="container mx-auto px-4"
                    >
                      Current Password
                    </label>
                    <div class="container mx-auto px-4">
                      <input
                        id="current-password"
                        type={showPasswords ? "text" : "password"}
                        bind:value={security.currentPassword}
                        class="container mx-auto px-4"
                        placeholder="Enter current password"
                      />
                      <button
                        type="button"
                        class="container mx-auto px-4"
                        on:click={() => (showPasswords = !showPasswords)}
                      >
                        {#if showPasswords}
                          <EyeOff class="container mx-auto px-4" />
                        {:else}
                          <Eye class="container mx-auto px-4" />
                        {/if}
                      </button>
                    </div>
                  </div>

                  <div class="container mx-auto px-4">
                    <div>
                      <label
                        for="new-password"
                        class="container mx-auto px-4"
                      >
                        New Password
                      </label>
                      <input
                        id="new-password"
                        type={showPasswords ? "text" : "password"}
                        bind:value={security.newPassword}
                        class="container mx-auto px-4"
                        placeholder="Enter new password"
                      />
                    </div>

                    <div>
                      <label
                        for="confirm-password"
                        class="container mx-auto px-4"
                      >
                        Confirm Password
                      </label>
                      <input
                        id="confirm-password"
                        type={showPasswords ? "text" : "password"}
                        bind:value={security.confirmPassword}
                        class="container mx-auto px-4"
                        placeholder="Confirm new password"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <!-- Two-Factor Authentication -->
              <div>
                <h3 class="container mx-auto px-4">
                  Two-Factor Authentication
                </h3>
                <div class="container mx-auto px-4">
                  <input
                    id="two-factor"
                    type="checkbox"
                    bind:checked={security.twoFactorEnabled}
                    class="container mx-auto px-4"
                  />
                  <label for="two-factor" class="container mx-auto px-4">
                    Enable two-factor authentication
                  </label>
                </div>
              </div>

              <!-- Session Management -->
              <div>
                <h3 class="container mx-auto px-4">Session Management</h3>
                <div class="container mx-auto px-4">
                  <div>
                    <label
                      for="session-timeout"
                      class="container mx-auto px-4"
                    >
                      Session Timeout (minutes)
                    </label>
                    <select
                      id="session-timeout"
                      bind:value={security.sessionTimeout}
                      class="container mx-auto px-4"
                    >
                      <option value={15}>15 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={60}>1 hour</option>
                      <option value={120}>2 hours</option>
                      <option value={480}>8 hours</option>
                    </select>
                  </div>

                  <div class="container mx-auto px-4">
                    <input
                      id="remember-me"
                      type="checkbox"
                      bind:checked={security.allowRememberMe}
                      class="container mx-auto px-4"
                    />
                    <label for="remember-me" class="container mx-auto px-4">
                      Allow "Remember me" option
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <!-- Data & Privacy Tab -->
        {#if activeTab === "data"}
          <div class="container mx-auto px-4">
            <h2 class="container mx-auto px-4">
              <Download class="container mx-auto px-4" />
              Data & Privacy
            </h2>

            <div class="container mx-auto px-4">
              <!-- Data Export -->
              <div>
                <h3 class="container mx-auto px-4">Export Your Data</h3>
                <div class="container mx-auto px-4">
                  <div class="container mx-auto px-4">
                    <div class="container mx-auto px-4">
                      <input
                        id="include-personal"
                        type="checkbox"
                        bind:checked={dataSettings.includePersonalData}
                        class="container mx-auto px-4"
                      />
                      <label
                        for="include-personal"
                        class="container mx-auto px-4"
                      >
                        Include personal data
                      </label>
                    </div>

                    <div class="container mx-auto px-4">
                      <input
                        id="include-logs"
                        type="checkbox"
                        bind:checked={dataSettings.includeSystemLogs}
                        class="container mx-auto px-4"
                      />
                      <label for="include-logs" class="container mx-auto px-4">
                        Include system logs
                      </label>
                    </div>
                  </div>

                  <div>
                    <label
                      for="export-format"
                      class="container mx-auto px-4"
                    >
                      Export Format
                    </label>
                    <select
                      id="export-format"
                      bind:value={dataSettings.exportFormat}
                      class="container mx-auto px-4"
                    >
                      <option value="json">JSON</option>
                      <option value="csv">CSV</option>
                      <option value="xml">XML</option>
                    </select>
                  </div>

                  <Button on:click={() => exportUserData()}>
                    <Download class="container mx-auto px-4" />
                    Export My Data
                  </Button>
                </div>
              </div>

              <!-- Auto Backup -->
              <div>
                <h3 class="container mx-auto px-4">Automatic Backup</h3>
                <div class="container mx-auto px-4">
                  <div class="container mx-auto px-4">
                    <input
                      id="auto-backup"
                      type="checkbox"
                      bind:checked={dataSettings.autoBackup}
                      class="container mx-auto px-4"
                    />
                    <label for="auto-backup" class="container mx-auto px-4">
                      Enable automatic backups
                    </label>
                  </div>

                  {#if dataSettings.autoBackup}
                    <div>
                      <label
                        for="backup-frequency"
                        class="container mx-auto px-4"
                      >
                        Backup Frequency
                      </label>
                      <select
                        id="backup-frequency"
                        bind:value={dataSettings.backupFrequency}
                        class="container mx-auto px-4"
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                  {/if}
                </div>
              </div>

              <!-- Danger Zone -->
              <div class="container mx-auto px-4">
                <h3 class="container mx-auto px-4">
                  Danger Zone
                </h3>
                <div class="container mx-auto px-4">
                  <div>
                    <h4 class="container mx-auto px-4">
                      Reset All Settings
                    </h4>
                    <p class="container mx-auto px-4">
                      This will reset all your preferences to default values.
                      This action cannot be undone.
                    </p>
                    <Button
                      variant="outline"
                      on:click={() => resetToDefaults()}
                    >
                      <RefreshCw class="container mx-auto px-4" />
                      Reset to Defaults
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <!-- Save Actions -->
        <div class="container mx-auto px-4">
          <div class="container mx-auto px-4">
            <div class="container mx-auto px-4">
              Changes are saved automatically when you update settings
            </div>
            <div class="container mx-auto px-4">
              <Button variant="outline" on:click={() => loadSettings()}>
                <RefreshCw class="container mx-auto px-4" />
                Reset Changes
              </Button>
              <Button on:click={() => saveSettings()} disabled={isSaving}>
                {#if isSaving}
                  <RefreshCw class="container mx-auto px-4" />
                  Saving...
                {:else}
                  <Save class="container mx-auto px-4" />
                  Save Settings
                {/if}
              </Button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
