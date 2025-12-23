# Config for Powerlevel10k with Everforest Light color scheme.
# Based on the Everforest color palette: https://github.com/sainnhe/everforest
#
# Everforest Light Color Palette:
# - Background: #FDF6E3 (bg0)
# - Foreground: #5C6A72 (fg)
# - Red: #F85552, Orange: #F57D26, Yellow: #DFA000
# - Green: #8DA101, Aqua: #35A77C, Blue: #3A94C5, Purple: #DF69BA
# - Grey: #939F91 (grey1)

# Temporarily change options.
'builtin' 'local' '-a' 'p10k_config_opts'
[[ ! -o 'aliases'         ]] || p10k_config_opts+=('aliases')
[[ ! -o 'sh_glob'         ]] || p10k_config_opts+=('sh_glob')
[[ ! -o 'no_brace_expand' ]] || p10k_config_opts+=('no_brace_expand')
'builtin' 'setopt' 'no_aliases' 'no_sh_glob' 'brace_expand'

() {
  emulate -L zsh -o extended_glob

  # Unset all configuration options.
  unset -m '(POWERLEVEL9K_*|DEFAULT_USER)~POWERLEVEL9K_GITSTATUS_DIR'

  # Zsh >= 5.1 is required.
  [[ $ZSH_VERSION == (5.<1->*|<6->.*) ]] || return

  # Everforest Light Color Definitions
  local bg_dim='#EFEBD4'
  local bg0='#FDF6E3'
  local bg1='#F4F0D9'
  local bg2='#EFEBD4'
  local bg3='#E6E2CC'
  local bg4='#E0DCC7'
  local bg5='#BDC3AF'
  local bg_visual='#EAEDC8'
  local bg_red='#FDE3DA'
  local bg_yellow='#FAEDCD'
  local bg_green='#F0F1D2'
  local bg_blue='#E9F0E9'
  local bg_purple='#FAE8E2'
  local fg='#5C6A72'
  local red='#F85552'
  local orange='#F57D26'
  local yellow='#DFA000'
  local green='#8DA101'
  local aqua='#35A77C'
  local blue='#3A94C5'
  local purple='#DF69BA'
  local grey0='#A6B0A0'
  local grey1='#939F91'
  local grey2='#829181'
  local statusline1='#93B259'
  local statusline2='#708089'
  local statusline3='#E66868'

  # The list of segments shown on the left.
  typeset -g POWERLEVEL9K_LEFT_PROMPT_ELEMENTS=(
    # =========================[ Line #1 ]=========================
    os_icon                 # os identifier
    dir                     # current directory
    vcs                     # git status
    # =========================[ Line #2 ]=========================
    newline                 # \n
    prompt_char             # prompt symbol
  )

  # The list of segments shown on the right.
  typeset -g POWERLEVEL9K_RIGHT_PROMPT_ELEMENTS=(
    # =========================[ Line #1 ]=========================
    status                  # exit code of the last command
    command_execution_time  # duration of the last command
    background_jobs         # presence of background jobs
    direnv                  # direnv status
    virtualenv              # python virtual environment
    anaconda                # conda environment
    pyenv                   # python environment
    goenv                   # go environment
    nodenv                  # node.js version from nodenv
    nvm                     # node.js version from nvm
    nodeenv                 # node.js environment
    rbenv                   # ruby version from rbenv
    rvm                     # ruby version from rvm
    kubecontext             # current kubernetes context
    terraform               # terraform workspace
    aws                     # aws profile
    azure                   # azure account name
    gcloud                  # google cloud cli account and project
    context                 # user@hostname
    # =========================[ Line #2 ]=========================
    newline
    # Empty line
  )

  # Basic style options that define the overall prompt appearance.
  typeset -g POWERLEVEL9K_BACKGROUND=$bg0
  typeset -g POWERLEVEL9K_FOREGROUND=$fg
  typeset -g POWERLEVEL9K_VISUAL_IDENTIFIER_COLOR=$grey1
  typeset -g POWERLEVEL9K_LEFT_SEGMENT_SEPARATOR=''
  typeset -g POWERLEVEL9K_RIGHT_SEGMENT_SEPARATOR=''
  typeset -g POWERLEVEL9K_LEFT_SEGMENT_END_SEPARATOR=''
  typeset -g POWERLEVEL9K_RIGHT_SEGMENT_START_SEPARATOR=''
  typeset -g POWERLEVEL9K_LEFT_SUBSEGMENT_SEPARATOR=' '
  typeset -g POWERLEVEL9K_RIGHT_SUBSEGMENT_SEPARATOR=' '
  typeset -g POWERLEVEL9K_WHITESPACE_BETWEEN_LEFT_SEGMENTS=''
  typeset -g POWERLEVEL9K_WHITESPACE_BETWEEN_RIGHT_SEGMENTS=''
  typeset -g POWERLEVEL9K_EMPTY_LINE_LEFT_PROMPT_FIRST_SEGMENT_END_SEPARATOR='%{%}'
  typeset -g POWERLEVEL9K_EMPTY_LINE_RIGHT_PROMPT_FIRST_SEGMENT_START_SEPARATOR='%{%}'
  typeset -g POWERLEVEL9K_EMPTY_LINE_LEFT_PROMPT_LAST_SEGMENT_END_SEPARATOR='%{%}'

  # OS identifier color.
  typeset -g POWERLEVEL9K_OS_ICON_FOREGROUND=$blue
  typeset -g POWERLEVEL9K_OS_ICON_BACKGROUND=$bg1

  # Directory colors.
  typeset -g POWERLEVEL9K_DIR_BACKGROUND=$bg1
  typeset -g POWERLEVEL9K_DIR_FOREGROUND=$blue
  typeset -g POWERLEVEL9K_DIR_SHORTENED_FOREGROUND=$grey1
  typeset -g POWERLEVEL9K_DIR_ANCHOR_FOREGROUND=$blue
  typeset -g POWERLEVEL9K_DIR_ANCHOR_BOLD=true
  typeset -g POWERLEVEL9K_SHORTEN_STRATEGY=truncate_to_unique
  typeset -g POWERLEVEL9K_SHORTEN_DELIMITER=
  typeset -g POWERLEVEL9K_DIR_MAX_LENGTH=80
  typeset -g POWERLEVEL9K_DIR_MIN_COMMAND_COLUMNS=40
  typeset -g POWERLEVEL9K_DIR_MIN_COMMAND_COLUMNS_PCT=50
  typeset -g POWERLEVEL9K_DIR_HYPERLINK=false
  typeset -g POWERLEVEL9K_DIR_SHOW_WRITABLE=v3

  # Git status colors.
  typeset -g POWERLEVEL9K_VCS_CLEAN_FOREGROUND=$green
  typeset -g POWERLEVEL9K_VCS_CLEAN_BACKGROUND=$bg_green
  typeset -g POWERLEVEL9K_VCS_UNTRACKED_FOREGROUND=$yellow
  typeset -g POWERLEVEL9K_VCS_UNTRACKED_BACKGROUND=$bg_yellow
  typeset -g POWERLEVEL9K_VCS_MODIFIED_FOREGROUND=$orange
  typeset -g POWERLEVEL9K_VCS_MODIFIED_BACKGROUND=$bg_yellow
  typeset -g POWERLEVEL9K_VCS_STAGED_FOREGROUND=$aqua
  typeset -g POWERLEVEL9K_VCS_STAGED_BACKGROUND=$bg_green
  typeset -g POWERLEVEL9K_VCS_CONFLICTED_FOREGROUND=$red
  typeset -g POWERLEVEL9K_VCS_CONFLICTED_BACKGROUND=$bg_red
  typeset -g POWERLEVEL9K_VCS_LOADING_FOREGROUND=$grey1
  typeset -g POWERLEVEL9K_VCS_LOADING_BACKGROUND=$bg2

  # Git status icons.
  typeset -g POWERLEVEL9K_VCS_BRANCH_ICON='\uF126 '
  typeset -g POWERLEVEL9K_VCS_UNTRACKED_ICON='?'
  typeset -g POWERLEVEL9K_VCS_UNSTAGED_ICON='!'
  typeset -g POWERLEVEL9K_VCS_STAGED_ICON='+'
  typeset -g POWERLEVEL9K_VCS_STASH_ICON='*'
  typeset -g POWERLEVEL9K_VCS_INCOMING_CHANGES_ICON='⇣'
  typeset -g POWERLEVEL9K_VCS_OUTGOING_CHANGES_ICON='⇡'
  typeset -g POWERLEVEL9K_VCS_COMMIT_ICON='@'

  # Prompt character colors.
  typeset -g POWERLEVEL9K_PROMPT_CHAR_BACKGROUND=
  typeset -g POWERLEVEL9K_PROMPT_CHAR_OK_{VIINS,VICMD,VIVIS,VIOWR}_FOREGROUND=$green
  typeset -g POWERLEVEL9K_PROMPT_CHAR_ERROR_{VIINS,VICMD,VIVIS,VIOWR}_FOREGROUND=$red
  typeset -g POWERLEVEL9K_PROMPT_CHAR_{OK,ERROR}_VIINS_CONTENT_EXPANSION='❯'
  typeset -g POWERLEVEL9K_PROMPT_CHAR_{OK,ERROR}_VICMD_CONTENT_EXPANSION='❮'
  typeset -g POWERLEVEL9K_PROMPT_CHAR_{OK,ERROR}_VIVIS_CONTENT_EXPANSION='V'
  typeset -g POWERLEVEL9K_PROMPT_CHAR_{OK,ERROR}_VIOWR_CONTENT_EXPANSION='▶'
  typeset -g POWERLEVEL9K_PROMPT_CHAR_OVERWRITE_STATE=true
  typeset -g POWERLEVEL9K_PROMPT_CHAR_LEFT_PROMPT_LAST_SEGMENT_END_SEPARATOR=''
  typeset -g POWERLEVEL9K_PROMPT_CHAR_LEFT_PROMPT_FIRST_SEGMENT_START_SEPARATOR=

  # Status colors.
  typeset -g POWERLEVEL9K_STATUS_EXTENDED_STATES=true
  typeset -g POWERLEVEL9K_STATUS_OK=false
  typeset -g POWERLEVEL9K_STATUS_OK_FOREGROUND=$green
  typeset -g POWERLEVEL9K_STATUS_OK_BACKGROUND=$bg_green
  typeset -g POWERLEVEL9K_STATUS_OK_PIPE=true
  typeset -g POWERLEVEL9K_STATUS_ERROR_FOREGROUND=$red
  typeset -g POWERLEVEL9K_STATUS_ERROR_BACKGROUND=$bg_red
  typeset -g POWERLEVEL9K_STATUS_ERROR_SIGNAL_FOREGROUND=$red
  typeset -g POWERLEVEL9K_STATUS_ERROR_SIGNAL_BACKGROUND=$bg_red
  typeset -g POWERLEVEL9K_STATUS_ERROR_PIPE_FOREGROUND=$red
  typeset -g POWERLEVEL9K_STATUS_ERROR_PIPE_BACKGROUND=$bg_red

  # Command execution time colors.
  typeset -g POWERLEVEL9K_COMMAND_EXECUTION_TIME_THRESHOLD=3
  typeset -g POWERLEVEL9K_COMMAND_EXECUTION_TIME_PRECISION=0
  typeset -g POWERLEVEL9K_COMMAND_EXECUTION_TIME_FOREGROUND=$yellow
  typeset -g POWERLEVEL9K_COMMAND_EXECUTION_TIME_BACKGROUND=$bg_yellow
  typeset -g POWERLEVEL9K_COMMAND_EXECUTION_TIME_FORMAT='d h m s'

  # Background jobs colors.
  typeset -g POWERLEVEL9K_BACKGROUND_JOBS_VERBOSE=false
  typeset -g POWERLEVEL9K_BACKGROUND_JOBS_FOREGROUND=$aqua
  typeset -g POWERLEVEL9K_BACKGROUND_JOBS_BACKGROUND=$bg_blue

  # Context colors.
  typeset -g POWERLEVEL9K_CONTEXT_FOREGROUND=$fg
  typeset -g POWERLEVEL9K_CONTEXT_BACKGROUND=$bg2
  typeset -g POWERLEVEL9K_CONTEXT_ROOT_FOREGROUND=$red
  typeset -g POWERLEVEL9K_CONTEXT_ROOT_BACKGROUND=$bg_red
  typeset -g POWERLEVEL9K_CONTEXT_{REMOTE,REMOTE_SUDO}_FOREGROUND=$orange
  typeset -g POWERLEVEL9K_CONTEXT_{REMOTE,REMOTE_SUDO}_BACKGROUND=$bg_yellow

  # Python virtual environment colors.
  typeset -g POWERLEVEL9K_VIRTUALENV_FOREGROUND=$aqua
  typeset -g POWERLEVEL9K_VIRTUALENV_BACKGROUND=$bg_blue
  typeset -g POWERLEVEL9K_VIRTUALENV_SHOW_PYTHON_VERSION=false
  typeset -g POWERLEVEL9K_VIRTUALENV_{LEFT,RIGHT}_DELIMITER=

  # Conda environment colors.
  typeset -g POWERLEVEL9K_ANACONDA_FOREGROUND=$aqua
  typeset -g POWERLEVEL9K_ANACONDA_BACKGROUND=$bg_blue

  # Python environment colors.
  typeset -g POWERLEVEL9K_PYENV_FOREGROUND=$aqua
  typeset -g POWERLEVEL9K_PYENV_BACKGROUND=$bg_blue

  # Go environment colors.
  typeset -g POWERLEVEL9K_GOENV_FOREGROUND=$aqua
  typeset -g POWERLEVEL9K_GOENV_BACKGROUND=$bg_blue

  # Node.js environment colors.
  typeset -g POWERLEVEL9K_NODENV_FOREGROUND=$green
  typeset -g POWERLEVEL9K_NODENV_BACKGROUND=$bg_green
  typeset -g POWERLEVEL9K_NVM_FOREGROUND=$green
  typeset -g POWERLEVEL9K_NVM_BACKGROUND=$bg_green
  typeset -g POWERLEVEL9K_NODEENV_FOREGROUND=$green
  typeset -g POWERLEVEL9K_NODEENV_BACKGROUND=$bg_green

  # Ruby environment colors.
  typeset -g POWERLEVEL9K_RBENV_FOREGROUND=$red
  typeset -g POWERLEVEL9K_RBENV_BACKGROUND=$bg_red
  typeset -g POWERLEVEL9K_RVM_FOREGROUND=$red
  typeset -g POWERLEVEL9K_RVM_BACKGROUND=$bg_red

  # Kubernetes context colors.
  typeset -g POWERLEVEL9K_KUBECONTEXT_SHOW_ON_COMMAND='kubectl|helm|kubens|kubectx|oc|istioctl|kogito|k9s|helmfile|flux|fluxctl|stern|kubeseal|skaffold|kubent|kubecolor'
  typeset -g POWERLEVEL9K_KUBECONTEXT_FOREGROUND=$blue
  typeset -g POWERLEVEL9K_KUBECONTEXT_BACKGROUND=$bg_blue

  # Terraform colors.
  typeset -g POWERLEVEL9K_TERRAFORM_FOREGROUND=$purple
  typeset -g POWERLEVEL9K_TERRAFORM_BACKGROUND=$bg_purple

  # AWS colors.
  typeset -g POWERLEVEL9K_AWS_FOREGROUND=$orange
  typeset -g POWERLEVEL9K_AWS_BACKGROUND=$bg_yellow

  # Azure colors.
  typeset -g POWERLEVEL9K_AZURE_FOREGROUND=$blue
  typeset -g POWERLEVEL9K_AZURE_BACKGROUND=$bg_blue

  # Google Cloud colors.
  typeset -g POWERLEVEL9K_GCLOUD_FOREGROUND=$blue
  typeset -g POWERLEVEL9K_GCLOUD_BACKGROUND=$bg_blue

  # Direnv colors.
  typeset -g POWERLEVEL9K_DIRENV_FOREGROUND=$yellow
  typeset -g POWERLEVEL9K_DIRENV_BACKGROUND=$bg_yellow

  # Instant prompt mode.
  typeset -g POWERLEVEL9K_INSTANT_PROMPT=verbose
  typeset -g POWERLEVEL9K_DISABLE_HOT_RELOAD=true

  # Transient prompt.
  typeset -g POWERLEVEL9K_TRANSIENT_PROMPT=always
  typeset -g POWERLEVEL9K_TRANSIENT_PROMPT_CHAR_OK_VIINS_FOREGROUND=$green
  typeset -g POWERLEVEL9K_TRANSIENT_PROMPT_CHAR_ERROR_VIINS_FOREGROUND=$red

  # Multiline prompt.
  typeset -g POWERLEVEL9K_PROMPT_ADD_NEWLINE=true
  typeset -g POWERLEVEL9K_MULTILINE_FIRST_PROMPT_PREFIX=
  typeset -g POWERLEVEL9K_MULTILINE_NEWLINE_PROMPT_PREFIX=
  typeset -g POWERLEVEL9K_MULTILINE_LAST_PROMPT_PREFIX=
  typeset -g POWERLEVEL9K_MULTILINE_FIRST_PROMPT_SUFFIX=
  typeset -g POWERLEVEL9K_MULTILINE_NEWLINE_PROMPT_SUFFIX=
  typeset -g POWERLEVEL9K_MULTILINE_LAST_PROMPT_SUFFIX=

  # Ruler.
  typeset -g POWERLEVEL9K_SHOW_RULER=false
  typeset -g POWERLEVEL9K_RULER_CHAR='─'
  typeset -g POWERLEVEL9K_RULER_FOREGROUND=$grey1

  # Filler between left and right prompt on the first prompt line.
  typeset -g POWERLEVEL9K_MULTILINE_FIRST_PROMPT_GAP_CHAR=' '
  typeset -g POWERLEVEL9K_MULTILINE_FIRST_PROMPT_GAP_BACKGROUND=
  typeset -g POWERLEVEL9K_MULTILINE_NEWLINE_PROMPT_GAP_BACKGROUND=
  if [[ $POWERLEVEL9K_MULTILINE_FIRST_PROMPT_GAP_CHAR != ' ' ]]; then
    typeset -g POWERLEVEL9K_MULTILINE_FIRST_PROMPT_GAP_FOREGROUND=$grey1
    typeset -g POWERLEVEL9K_EMPTY_LINE_LEFT_PROMPT_FIRST_SEGMENT_END_SEPARATOR='%{%}'
    typeset -g POWERLEVEL9K_EMPTY_LINE_RIGHT_PROMPT_FIRST_SEGMENT_START_SEPARATOR='%{%}'
  fi

  # Default background color.
  typeset -g POWERLEVEL9K_BACKGROUND=$bg0

  # Segment colors that haven't been explicitly defined above.
  typeset -g POWERLEVEL9K_SEGMENT_FOREGROUND=$fg
  typeset -g POWERLEVEL9K_SEGMENT_BACKGROUND=$bg1

  # Icon color.
  typeset -g POWERLEVEL9K_VISUAL_IDENTIFIER_COLOR=$grey1

  # Left/right anchor.
  typeset -g POWERLEVEL9K_LEFT_PROMPT_FIRST_SEGMENT_START_SEPARATOR=
  typeset -g POWERLEVEL9K_RIGHT_PROMPT_LAST_SEGMENT_END_SEPARATOR=

  # Segment separators.
  typeset -g POWERLEVEL9K_LEFT_SEGMENT_SEPARATOR=
  typeset -g POWERLEVEL9K_RIGHT_SEGMENT_SEPARATOR=
  typeset -g POWERLEVEL9K_LEFT_SEGMENT_END_SEPARATOR=
  typeset -g POWERLEVEL9K_RIGHT_SEGMENT_START_SEPARATOR=

  # Subsegment separators.
  typeset -g POWERLEVEL9K_LEFT_SUBSEGMENT_SEPARATOR=' '
  typeset -g POWERLEVEL9K_RIGHT_SUBSEGMENT_SEPARATOR=' '

  # Segment spacing.
  typeset -g POWERLEVEL9K_WHITESPACE_BETWEEN_LEFT_SEGMENTS=
  typeset -g POWERLEVEL9K_WHITESPACE_BETWEEN_RIGHT_SEGMENTS=

  # Colors for additional segments (if used).
  typeset -g POWERLEVEL9K_TIME_FOREGROUND=$grey1
  typeset -g POWERLEVEL9K_TIME_BACKGROUND=$bg2
  typeset -g POWERLEVEL9K_DATE_FOREGROUND=$grey1
  typeset -g POWERLEVEL9K_DATE_BACKGROUND=$bg2
  typeset -g POWERLEVEL9K_BATTERY_LOW_FOREGROUND=$red
  typeset -g POWERLEVEL9K_BATTERY_CHARGING_FOREGROUND=$yellow
  typeset -g POWERLEVEL9K_BATTERY_CHARGED_FOREGROUND=$green
  typeset -g POWERLEVEL9K_BATTERY_DISCONNECTED_FOREGROUND=$grey1
  typeset -g POWERLEVEL9K_WIFI_FOREGROUND=$blue
  typeset -g POWERLEVEL9K_WIFI_BACKGROUND=$bg_blue
  typeset -g POWERLEVEL9K_IP_FOREGROUND=$blue
  typeset -g POWERLEVEL9K_IP_BACKGROUND=$bg_blue
  typeset -g POWERLEVEL9K_LOAD_CRITICAL_FOREGROUND=$red
  typeset -g POWERLEVEL9K_LOAD_WARNING_FOREGROUND=$yellow
  typeset -g POWERLEVEL9K_LOAD_NORMAL_FOREGROUND=$green
  typeset -g POWERLEVEL9K_RAM_FOREGROUND=$aqua
  typeset -g POWERLEVEL9K_RAM_BACKGROUND=$bg_blue
  typeset -g POWERLEVEL9K_SWAP_FOREGROUND=$orange
  typeset -g POWERLEVEL9K_SWAP_BACKGROUND=$bg_yellow
  typeset -g POWERLEVEL9K_DISK_USAGE_CRITICAL_FOREGROUND=$red
  typeset -g POWERLEVEL9K_DISK_USAGE_WARNING_FOREGROUND=$yellow
  typeset -g POWERLEVEL9K_DISK_USAGE_NORMAL_FOREGROUND=$green
  typeset -g POWERLEVEL9K_VPN_IP_FOREGROUND=$purple
  typeset -g POWERLEVEL9K_VPN_IP_BACKGROUND=$bg_purple
  typeset -g POWERLEVEL9K_TODO_FOREGROUND=$yellow
  typeset -g POWERLEVEL9K_TODO_BACKGROUND=$bg_yellow
  typeset -g POWERLEVEL9K_TIMEWARRIOR_FOREGROUND=$aqua
  typeset -g POWERLEVEL9K_TIMEWARRIOR_BACKGROUND=$bg_blue
  typeset -g POWERLEVEL9K_TASKWARRIOR_FOREGROUND=$aqua
  typeset -g POWERLEVEL9K_TASKWARRIOR_BACKGROUND=$bg_blue
}

# Restore original options.
(( ${#p10k_config_opts} )) && setopt ${p10k_config_opts[@]}
'builtin' 'unset' 'p10k_config_opts'