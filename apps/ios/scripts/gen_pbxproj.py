#!/usr/bin/env python3
"""Genera un project.pbxproj minimale ma valido per una app iOS SwiftUI,
senza dipendere da xcodegen/CocoaPods. Layout "flat": .xcodeproj e sorgenti
Swift nella stessa cartella (niente gruppo annidato).

Uso:
    python3 gen_pbxproj.py <AppName> <bundle_id_suffix> <file1.swift> [file2.swift ...]

Scrive ios/<AppName>/<AppName>.xcodeproj/project.pbxproj
"""
import sys
import os
import uuid

def new_id(counter=[0x100000000000000000000000]):
    counter[0] += 1
    return format(counter[0], "024X")


def main():
    app_name = sys.argv[1]
    bundle_suffix = sys.argv[2]
    swift_files = sys.argv[3:]

    ids = {}
    def uid(key):
        if key not in ids:
            ids[key] = new_id()
        return ids[key]

    project_root = f"ios/{app_name}"
    proj_id = uid("project")
    main_group_id = uid("mainGroup")
    products_group_id = uid("productsGroup")
    app_product_id = uid("appProduct")
    target_id = uid("target")
    target_config_list_id = uid("targetConfigList")
    target_config_debug_id = uid("targetConfigDebug")
    target_config_release_id = uid("targetConfigRelease")
    proj_config_list_id = uid("projConfigList")
    proj_config_debug_id = uid("projConfigDebug")
    proj_config_release_id = uid("projConfigRelease")
    sources_phase_id = uid("sourcesPhase")
    resources_phase_id = uid("resourcesPhase")
    frameworks_phase_id = uid("frameworksPhase")
    assets_ref_id = uid("assetsRef")
    assets_build_id = uid("assetsBuild")
    plist_ref_id = uid("plistRef")

    file_refs = {}
    build_files = {}
    for f in swift_files:
        file_refs[f] = uid(f"ref_{f}")
        build_files[f] = uid(f"build_{f}")

    bundle_id = f"com.piazzetta.{bundle_suffix}"

    # --- PBXBuildFile ---
    build_file_lines = []
    for f in swift_files:
        build_file_lines.append(
            f"\t\t{build_files[f]} /* {f} in Sources */ = {{isa = PBXBuildFile; fileRef = {file_refs[f]} /* {f} */; }};"
        )
    build_file_lines.append(
        f"\t\t{assets_build_id} /* Assets.xcassets in Resources */ = {{isa = PBXBuildFile; fileRef = {assets_ref_id} /* Assets.xcassets */; }};"
    )

    # --- PBXFileReference ---
    file_ref_lines = []
    for f in swift_files:
        file_ref_lines.append(
            f"\t\t{file_refs[f]} /* {f} */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = {f}; sourceTree = \"<group>\"; }};"
        )
    file_ref_lines.append(
        f"\t\t{assets_ref_id} /* Assets.xcassets */ = {{isa = PBXFileReference; lastKnownFileType = folder.assetcatalog; path = Assets.xcassets; sourceTree = \"<group>\"; }};"
    )
    file_ref_lines.append(
        f"\t\t{plist_ref_id} /* Info.plist */ = {{isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = \"<group>\"; }};"
    )
    file_ref_lines.append(
        f"\t\t{app_product_id} /* {app_name}.app */ = {{isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = {app_name}.app; sourceTree = BUILT_PRODUCTS_DIR; }};"
    )

    # --- Groups ---
    main_children_sep = ",\n\t\t\t\t"
    main_children = main_children_sep.join([file_refs[f] + f" /* {f} */" for f in swift_files])
    main_group = f"""\t\t{main_group_id} = {{
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t{main_children},
\t\t\t\t{assets_ref_id} /* Assets.xcassets */,
\t\t\t\t{plist_ref_id} /* Info.plist */,
\t\t\t\t{products_group_id} /* Products */,
\t\t\t);
\t\t\tsourceTree = "<group>";
\t\t}};"""

    products_group = f"""\t\t{products_group_id} /* Products */ = {{
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t{app_product_id} /* {app_name}.app */,
\t\t\t);
\t\t\tname = Products;
\t\t\tsourceTree = "<group>";
\t\t}};"""

    # --- Build phases ---
    sources_files = ",\n\t\t\t\t".join([build_files[f] + f" /* {f} in Sources */" for f in swift_files])
    sources_phase = f"""\t\t{sources_phase_id} /* Sources */ = {{
\t\t\tisa = PBXSourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t\t{sources_files},
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};"""

    resources_phase = f"""\t\t{resources_phase_id} /* Resources */ = {{
\t\t\tisa = PBXResourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t\t{assets_build_id} /* Assets.xcassets in Resources */,
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};"""

    frameworks_phase = f"""\t\t{frameworks_phase_id} /* Frameworks */ = {{
\t\t\tisa = PBXFrameworksBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};"""

    # --- Native target ---
    native_target = f"""\t\t{target_id} /* {app_name} */ = {{
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = {target_config_list_id} /* Build configuration list for PBXNativeTarget "{app_name}" */;
\t\t\tbuildPhases = (
\t\t\t\t{sources_phase_id} /* Sources */,
\t\t\t\t{frameworks_phase_id} /* Frameworks */,
\t\t\t\t{resources_phase_id} /* Resources */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t);
\t\t\tname = {app_name};
\t\t\tproductName = {app_name};
\t\t\tproductReference = {app_product_id} /* {app_name}.app */;
\t\t\tproductType = "com.apple.product-type.application";
\t\t}};"""

    # --- Project ---
    project = f"""\t\t{proj_id} /* Project object */ = {{
\t\t\tisa = PBXProject;
\t\t\tattributes = {{
\t\t\t\tBuildIndependentTargetsInParallel = 1;
\t\t\t\tLastSwiftUpdateCheck = 1620;
\t\t\t\tLastUpgradeCheck = 1620;
\t\t\t}};
\t\t\tbuildConfigurationList = {proj_config_list_id} /* Build configuration list for PBXProject "{app_name}" */;
\t\t\tcompatibilityVersion = "Xcode 14.0";
\t\t\tdevelopmentRegion = it;
\t\t\thasScannedForEncodings = 0;
\t\t\tknownRegions = (
\t\t\t\tit,
\t\t\t\tBase,
\t\t\t);
\t\t\tmainGroup = {main_group_id};
\t\t\tproductRefGroup = {products_group_id} /* Products */;
\t\t\tprojectDirPath = "";
\t\t\tprojectRoot = "";
\t\t\ttargets = (
\t\t\t\t{target_id} /* {app_name} */,
\t\t\t);
\t\t}};"""

    # --- Build configurations ---
    common_debug = """\t\t\t\tALWAYS_SEARCH_USER_PATHS = NO;
\t\t\t\tASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS = YES;
\t\t\t\tCLANG_ANALYZER_NONNULL = YES;
\t\t\t\tCLANG_ANALYZER_NUMBER_OBJECT_CONVERSION = YES_AGGRESSIVE;
\t\t\t\tCLANG_CXX_LANGUAGE_STANDARD = "gnu++20";
\t\t\t\tCLANG_ENABLE_MODULES = YES;
\t\t\t\tCLANG_ENABLE_OBJC_ARC = YES;
\t\t\t\tCLANG_ENABLE_OBJC_WEAK = YES;
\t\t\t\tCLANG_WARN_BLOCK_CAPTURE_AUTORELEASING = YES;
\t\t\t\tCLANG_WARN_BOOL_CONVERSION = YES;
\t\t\t\tCLANG_WARN_COMMA = YES;
\t\t\t\tCLANG_WARN_CONSTANT_CONVERSION = YES;
\t\t\t\tCLANG_WARN_DEPRECATED_OBJC_IMPLEMENTATIONS = YES;
\t\t\t\tCLANG_WARN_DIRECT_OBJC_ISA_USAGE = YES_ERROR;
\t\t\t\tCLANG_WARN_DOCUMENTATION_COMMENTS = YES;
\t\t\t\tCLANG_WARN_EMPTY_BODY = YES;
\t\t\t\tCLANG_WARN_ENUM_CONVERSION = YES;
\t\t\t\tCLANG_WARN_INFINITE_RECURSION = YES;
\t\t\t\tCLANG_WARN_INT_CONVERSION = YES;
\t\t\t\tCLANG_WARN_NON_LITERAL_NULL_CONVERSION = YES;
\t\t\t\tCLANG_WARN_OBJC_IMPLICIT_RETAIN_SELF = YES;
\t\t\t\tCLANG_WARN_OBJC_LITERAL_CONVERSION = YES;
\t\t\t\tCLANG_WARN_OBJC_ROOT_CLASS = YES_ERROR;
\t\t\t\tCLANG_WARN_QUOTED_INCLUDE_IN_FRAMEWORK_HEADER = YES;
\t\t\t\tCLANG_WARN_RANGE_LOOP_ANALYSIS = YES;
\t\t\t\tCLANG_WARN_STRICT_PROTOTYPES = YES;
\t\t\t\tCLANG_WARN_SUSPICIOUS_MOVE = YES;
\t\t\t\tCLANG_WARN_UNGUARDED_AVAILABILITY = YES_AGGRESSIVE;
\t\t\t\tCLANG_WARN_UNREACHABLE_CODE = YES;
\t\t\t\tCLANG_WARN__DUPLICATE_METHOD_MATCH = YES;
\t\t\t\tCOPY_PHASE_STRIP = NO;
\t\t\t\tDEBUG_INFORMATION_FORMAT = dwarf;
\t\t\t\tENABLE_STRICT_OBJC_MSGSEND = YES;
\t\t\t\tENABLE_TESTABILITY = YES;
\t\t\t\tGCC_C_LANGUAGE_STANDARD = gnu17;
\t\t\t\tGCC_DYNAMIC_NO_PIC = NO;
\t\t\t\tGCC_NO_COMMON_BLOCKS = YES;
\t\t\t\tGCC_OPTIMIZATION_LEVEL = 0;
\t\t\t\tGCC_PREPROCESSOR_DEFINITIONS = (
\t\t\t\t\t"DEBUG=1",
\t\t\t\t\t"$(inherited)",
\t\t\t\t);
\t\t\t\tGCC_WARN_64_TO_32_BIT_CONVERSION = YES;
\t\t\t\tGCC_WARN_ABOUT_RETURN_TYPE = YES_ERROR;
\t\t\t\tGCC_WARN_UNDECLARED_SELECTOR = YES;
\t\t\t\tGCC_WARN_UNINITIALIZED_AUTOS = YES_AGGRESSIVE;
\t\t\t\tGCC_WARN_UNUSED_FUNCTION = YES;
\t\t\t\tGCC_WARN_UNUSED_VARIABLE = YES;
\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 17.0;
\t\t\t\tMTL_ENABLE_DEBUG_INFO = INCLUDE_SOURCE;
\t\t\t\tMTL_FAST_MATH = YES;
\t\t\t\tONLY_ACTIVE_ARCH = YES;
\t\t\t\tSDKROOT = iphoneos;
\t\t\t\tSWIFT_ACTIVE_COMPILATION_CONDITIONS = "DEBUG $(inherited)";
\t\t\t\tSWIFT_OPTIMIZATION_LEVEL = "-Onone";
"""
    common_release = common_debug.replace(
        '\t\t\t\tDEBUG_INFORMATION_FORMAT = dwarf;',
        '\t\t\t\tDEBUG_INFORMATION_FORMAT = "dwarf-with-dsym";'
    ).replace(
        '\t\t\t\tENABLE_TESTABILITY = YES;\n', ''
    ).replace(
        '\t\t\t\tGCC_OPTIMIZATION_LEVEL = 0;\n', ''
    ).replace(
        '\t\t\t\tGCC_PREPROCESSOR_DEFINITIONS = (\n\t\t\t\t\t"DEBUG=1",\n\t\t\t\t\t"$(inherited)",\n\t\t\t\t);\n', ''
    ).replace(
        '\t\t\t\tONLY_ACTIVE_ARCH = YES;\n', ''
    ).replace(
        '\t\t\t\tSWIFT_ACTIVE_COMPILATION_CONDITIONS = "DEBUG $(inherited)";\n', ''
    ).replace(
        '\t\t\t\tSWIFT_OPTIMIZATION_LEVEL = "-Onone";\n', '\t\t\t\tSWIFT_COMPILATION_MODE = wholemodule;\n'
    ).replace(
        '\t\t\t\tCOPY_PHASE_STRIP = NO;\n', ''
    )

    proj_config_debug = f"""\t\t{proj_config_debug_id} /* Debug */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {{
{common_debug}\t\t\t}};
\t\t\tname = Debug;
\t\t}};"""
    proj_config_release = f"""\t\t{proj_config_release_id} /* Release */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {{
{common_release}\t\t\t}};
\t\t\tname = Release;
\t\t}};"""

    target_settings_common = f"""\t\t\t\tASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
\t\t\t\tASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor;
\t\t\t\tCODE_SIGN_STYLE = Automatic;
\t\t\t\tCODE_SIGNING_ALLOWED = NO;
\t\t\t\tCODE_SIGNING_REQUIRED = NO;
\t\t\t\tCURRENT_PROJECT_VERSION = 1;
\t\t\t\tENABLE_PREVIEWS = YES;
\t\t\t\tGENERATE_INFOPLIST_FILE = NO;
\t\t\t\tINFOPLIST_FILE = Info.plist;
\t\t\t\tINFOPLIST_KEY_UILaunchScreen_Generation = YES;
\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 17.0;
\t\t\t\tLD_RUNPATH_SEARCH_PATHS = (
\t\t\t\t\t"$(inherited)",
\t\t\t\t\t"@executable_path/Frameworks",
\t\t\t\t);
\t\t\t\tMARKETING_VERSION = 1.0;
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = {bundle_id};
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t\tSWIFT_VERSION = 5.0;
\t\t\t\tTARGETED_DEVICE_FAMILY = "1,2";
"""

    target_config_debug = f"""\t\t{target_config_debug_id} /* Debug */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {{
{target_settings_common}\t\t\t}};
\t\t\tname = Debug;
\t\t}};"""
    target_config_release = f"""\t\t{target_config_release_id} /* Release */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {{
{target_settings_common}\t\t\t}};
\t\t\tname = Release;
\t\t}};"""

    proj_config_list = f"""\t\t{proj_config_list_id} /* Build configuration list for PBXProject "{app_name}" */ = {{
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t{proj_config_debug_id} /* Debug */,
\t\t\t\t{proj_config_release_id} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t}};"""
    target_config_list = f"""\t\t{target_config_list_id} /* Build configuration list for PBXNativeTarget "{app_name}" */ = {{
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t{target_config_debug_id} /* Debug */,
\t\t\t\t{target_config_release_id} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t}};"""

    pbxproj = f"""// !$*UTF8*$!
{{
\tarchiveVersion = 1;
\tclasses = {{
\t}};
\tobjectVersion = 56;
\tobjects = {{

/* Begin PBXBuildFile section */
{chr(10).join(build_file_lines)}
/* End PBXBuildFile section */

/* Begin PBXFileReference section */
{chr(10).join(file_ref_lines)}
/* End PBXFileReference section */

/* Begin PBXFrameworksBuildPhase section */
{frameworks_phase}
/* End PBXFrameworksBuildPhase section */

/* Begin PBXGroup section */
{main_group}
{products_group}
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
{native_target}
/* End PBXNativeTarget section */

/* Begin PBXProject section */
{project}
/* End PBXProject section */

/* Begin PBXResourcesBuildPhase section */
{resources_phase}
/* End PBXResourcesBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
{sources_phase}
/* End PBXSourcesBuildPhase section */

/* Begin XCBuildConfiguration section */
{proj_config_debug}
{proj_config_release}
{target_config_debug}
{target_config_release}
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
{proj_config_list}
{target_config_list}
/* End XCConfigurationList section */
\t}};
\trootObject = {proj_id} /* Project object */;
}}
"""

    out_dir = f"{project_root}/{app_name}.xcodeproj"
    os.makedirs(out_dir, exist_ok=True)
    with open(f"{out_dir}/project.pbxproj", "w") as fh:
        fh.write(pbxproj)

    # --- Scheme condiviso, necessario per `xcodebuild -scheme AppName` ---
    scheme_dir = f"{out_dir}/xcshareddata/xcschemes"
    os.makedirs(scheme_dir, exist_ok=True)
    scheme = f"""<?xml version="1.0" encoding="UTF-8"?>
<Scheme
   LastUpgradeVersion = "1620"
   version = "1.7">
   <BuildAction
      parallelizeBuildables = "YES"
      buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry
            buildForTesting = "YES"
            buildForRunning = "YES"
            buildForProfiling = "YES"
            buildForArchiving = "YES"
            buildForAnalyzing = "YES">
            <BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "{target_id}"
               BuildableName = "{app_name}.app"
               BlueprintName = "{app_name}"
               ReferencedContainer = "container:{app_name}.xcodeproj">
            </BuildableReference>
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <LaunchAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      launchStyle = "0"
      useCustomWorkingDirectory = "NO"
      ignoresPersistentStateOnLaunch = "NO"
      debugDocumentVersioning = "YES"
      debugServiceExtension = "internal"
      allowLocationSimulation = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "{target_id}"
            BuildableName = "{app_name}.app"
            BlueprintName = "{app_name}"
            ReferencedContainer = "container:{app_name}.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </LaunchAction>
</Scheme>
"""
    with open(f"{scheme_dir}/{app_name}.xcscheme", "w") as fh:
        fh.write(scheme)

    print(f"Scritto {out_dir}/project.pbxproj ({len(swift_files)} file sorgente) + scheme")


if __name__ == "__main__":
    main()
