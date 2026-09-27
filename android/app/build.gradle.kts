plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.xiaoxuhui.eml"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.xiaoxuhui.eml"
        minSdk = 24
        targetSdk = 34
        versionCode = 4
        versionName = "1.3.0"

        // 应用为单语言中文工具，去掉无用资源以减小体积
        resourceConfigurations += listOf("zh", "en")
    }

    /**
     * 固定 debug 签名。
     *
     * 不配这段的话，AGP 会在每台构建机上自动生成**随机** debug keystore：
     * GitHub Actions 每次都是全新 runner，于是每次发布出来的 APK 签名都不同，
     * 老用户装新包会直接被系统拒绝（INSTALL_FAILED_UPDATE_INCOMPATIBLE），
     * 表现就是「有新版本但装不上 / 无法更新」。
     *
     * 这里的 `debug.keystore` 随仓库提交：debug key 的密码在 Android 文档里是公开的
     * （android / androiddebugkey），本身没有保密价值，唯一重要的是**它必须固定不变**。
     * 换掉这个文件等于换签名，老用户将无法覆盖升级 —— 不要动它。
     */
    signingConfigs {
        getByName("debug") {
            storeFile = file("debug.keystore")
            storeType = "PKCS12"
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        debug {
            // 首版使用 debug 签名，便于直接安装
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.2")
    implementation("androidx.webkit:webkit:1.11.0")
}
